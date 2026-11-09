import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { paginated } from '../../common/utils/pagination.js';
import type { AdminCustomersQueryDto, CustomerSort } from './dto/admin-customers.dto.js';

/*
 * What the numbers mean:
 * - orderCount  every order except PENDING (payment never completed)
 * - totalSpent  paise across orders that went through: CONFIRMED, PACKED, SHIPPED, DELIVERED
 *               (cancelled and returned orders were refunded, so they don't count)
 * Guest orders aren't linked to an account, so they aren't counted here.
 */
const SPENT_STATUSES = ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'];

/** Column → ORDER BY; ties broken by id so pages never overlap. NULLs (never ordered) go last. */
const SORT_SQL: Record<CustomerSort, Prisma.Sql> = {
  createdAt: Prisma.sql`u."createdAt"`,
  orderCount: Prisma.sql`"orderCount"`,
  totalSpent: Prisma.sql`"totalSpent"`,
  lastOrderAt: Prisma.sql`"lastOrderAt"`,
};

type CustomerRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  createdAt: Date;
  addressCount: number;
  orderCount: number;
  cancelledCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
  total: bigint;
};

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
  createdAt: true,
} satisfies Prisma.AddressSelect;

/** Admin customer list: registered shoppers with their order totals and saved addresses. */
@Injectable()
export class AdminCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: AdminCustomersQueryDto) {
    const dir = q.sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const rows = await this.prisma.$queryRaw<CustomerRow[]>`
      SELECT u."id", u."firstName", u."lastName", u."email", u."phone",
             u."phoneVerified", u."emailVerified", u."createdAt",
             COALESCE(a."addressCount", 0)::int   AS "addressCount",
             COALESCE(o."orderCount", 0)::int     AS "orderCount",
             COALESCE(o."cancelledCount", 0)::int AS "cancelledCount",
             COALESCE(o."totalSpent", 0)::int     AS "totalSpent",
             o."lastOrderAt",
             COUNT(*) OVER()                      AS "total"
      FROM "User" u
      LEFT JOIN (
        SELECT "userId", COUNT(*) AS "addressCount" FROM "Address" GROUP BY "userId"
      ) a ON a."userId" = u."id"
      LEFT JOIN (
        SELECT "userId",
               COUNT(*) FILTER (WHERE "status" <> 'PENDING')                       AS "orderCount",
               COUNT(*) FILTER (WHERE "status" IN ('CANCELLED', 'RETURNED'))        AS "cancelledCount",
               SUM("grandTotal") FILTER (WHERE "status"::text IN (${Prisma.join(SPENT_STATUSES)})) AS "totalSpent",
               MAX("createdAt") FILTER (WHERE "status" <> 'PENDING')               AS "lastOrderAt"
        FROM "Order" WHERE "userId" IS NOT NULL GROUP BY "userId"
      ) o ON o."userId" = u."id"
      WHERE u."role" = 'CUSTOMER' ${this.searchSql(q.search)}
      ORDER BY ${SORT_SQL[q.sortBy]} ${dir} NULLS LAST, u."id" ${dir}
      LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`;

    const total = rows.length ? Number(rows[0].total) : await this.countMatching(q.search);
    const data = rows.map(({ total: _total, ...r }) => r);
    return paginated(data, total, q.page, q.limit);
  }

  /** Expanded row: every saved address (default first) and the latest orders. */
  async get(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: 'CUSTOMER' },
      select: {
        id: true,
        addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }], select: ADDRESS_SELECT },
        orders: {
          where: { status: { not: 'PENDING' } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, orderNumber: true, status: true, grandTotal: true, createdAt: true },
        },
      },
    });
    if (!user) throw new NotFoundException(`Customer ${id} not found`);
    return user;
  }

  /** Only needed when the requested page is past the end (no rows to read the window total from). */
  private async countMatching(search?: string) {
    const [{ n }] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM "User" u WHERE u."role" = 'CUSTOMER' ${this.searchSql(search)}`;
    return Number(n);
  }

  private searchSql(search?: string): Prisma.Sql {
    const s = search?.trim();
    if (!s) return Prisma.empty;
    const like = `%${s.replace(/[\\%_]/g, '\\$&')}%`;
    const digits = s.replace(/\D/g, '');
    const phone = digits.length >= 4 ? Prisma.sql`OR u."phone" LIKE ${`%${digits.slice(-10)}%`}` : Prisma.empty;
    return Prisma.sql`AND (
      u."email" ILIKE ${like}
      OR (COALESCE(u."firstName", '') || ' ' || COALESCE(u."lastName", '')) ILIKE ${like}
      ${phone}
    )`;
  }
}
