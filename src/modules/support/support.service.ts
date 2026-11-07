import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Role, SupportStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { pageArgs, paginated } from '../../common/utils/pagination.js';
import {
  MAX_ACTIVE_TICKETS,
  type AdminSupportQueryDto,
  type CreateSupportTicketDto,
  type MySupportQueryDto,
  type SupportMessageDto,
  type SupportTicketDetailDto,
  type SupportTicketPageDto,
  type SupportTicketSummaryDto,
} from './dto/support.dto.js';

const CLOSED_MESSAGE = 'This ticket is closed. Please open a new request if you still need help.';

const TICKET_FIELDS = {
  id: true,
  ticketNumber: true,
  reason: true,
  status: true,
  description: true,
  lastMessageAt: true,
  createdAt: true,
  closedAt: true,
} as const;

/** Customer list: the ticket plus who spoke last. */
const SUMMARY_SELECT = {
  ...TICKET_FIELDS,
  messages: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { senderRole: true } },
} as const;

/** Customer detail: every message, oldest first, without who exactly answered. */
const DETAIL_SELECT = {
  ...TICKET_FIELDS,
  messages: {
    orderBy: { createdAt: 'asc' as const },
    select: { id: true, body: true, senderRole: true, createdAt: true },
  },
} as const;

const CUSTOMER_FIELDS = { id: true, firstName: true, lastName: true, phone: true, email: true } as const;

/** Admin detail: customer contact details and which admin wrote each reply. */
const ADMIN_DETAIL_SELECT = {
  ...TICKET_FIELDS,
  updatedAt: true,
  user: { select: CUSTOMER_FIELDS },
  messages: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      body: true,
      senderRole: true,
      createdAt: true,
      sender: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} as const;

const ADMIN_LIST_SELECT = {
  ...TICKET_FIELDS,
  updatedAt: true,
  user: { select: CUSTOMER_FIELDS },
  messages: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { senderRole: true } },
  _count: { select: { messages: true } },
} as const;

const from = (role: Role): 'CUSTOMER' | 'SUPPORT' => (role === 'ADMIN' ? 'SUPPORT' : 'CUSTOMER');

type SummaryRow = Prisma.SupportTicketGetPayload<{ select: typeof SUMMARY_SELECT }>;
type DetailRow = Prisma.SupportTicketGetPayload<{ select: typeof DETAIL_SELECT }>;

function toSummary(t: SummaryRow): SupportTicketSummaryDto {
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    reason: t.reason,
    status: t.status,
    description: t.description,
    lastMessageAt: t.lastMessageAt,
    createdAt: t.createdAt,
    lastReplyFrom: t.messages[0] ? from(t.messages[0].senderRole) : null,
  };
}

function toDetail(t: DetailRow): SupportTicketDetailDto {
  const messages: SupportMessageDto[] = t.messages.map((m) => ({
    id: m.id,
    from: from(m.senderRole),
    body: m.body,
    createdAt: m.createdAt,
  }));
  const last = messages.at(-1);
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    reason: t.reason,
    status: t.status,
    description: t.description,
    lastMessageAt: t.lastMessageAt,
    createdAt: t.createdAt,
    closedAt: t.closedAt,
    lastReplyFrom: last ? last.from : null,
    messages,
  };
}

/** "SUP-1042", "sup1042" or "1042" → 1042. */
function ticketNumberFrom(search: string): number | null {
  const m = /^(?:sup-?)?(\d{1,9})$/i.exec(search.trim());
  return m ? Number(m[1]) : null;
}

/**
 * Support tickets.
 * Status rules: an admin reply → IN_PROGRESS; a customer reply → OPEN (back in the admin's queue);
 * admins set RESOLVED or CLOSED; nobody can reply to a CLOSED ticket.
 */
@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  /* ───────────── Customer ───────────── */

  async create(userId: string, dto: CreateSupportTicketDto): Promise<SupportTicketDetailDto> {
    const active = await this.prisma.supportTicket.count({ where: { userId, status: { not: 'CLOSED' } } });
    if (active >= MAX_ACTIVE_TICKETS) {
      throw new BadRequestException(
        `You already have ${MAX_ACTIVE_TICKETS} open requests. Please continue in one of those, or close one first.`,
      );
    }
    const ticket = await this.prisma.supportTicket.create({
      data: { userId, reason: dto.reason, description: dto.description },
      select: DETAIL_SELECT,
    });
    return toDetail(ticket);
  }

  async listMine(userId: string, q: MySupportQueryDto): Promise<SupportTicketPageDto> {
    const where = { userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        select: SUMMARY_SELECT,
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return paginated(rows.map(toSummary), total, q.page, q.limit);
  }

  /** 404 for someone else's ticket too, so ids can't be probed. */
  async getMine(userId: string, id: string): Promise<SupportTicketDetailDto> {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id, userId }, select: DETAIL_SELECT });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return toDetail(ticket);
  }

  async replyAsCustomer(userId: string, id: string, body: string): Promise<SupportTicketDetailDto> {
    await this.reply({ id, userId }, userId, 'CUSTOMER', body, 'OPEN');
    return this.getMine(userId, id);
  }

  /** Closing an already-closed ticket is a no-op. */
  async closeMine(userId: string, id: string): Promise<SupportTicketDetailDto> {
    const { count } = await this.prisma.supportTicket.updateMany({
      where: { id, userId, status: { not: 'CLOSED' } },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    if (count === 0) await this.getMine(userId, id); // 404 if it isn't theirs
    return this.getMine(userId, id);
  }

  /* ───────────── Admin ───────────── */

  /** Inbox: OPEN first, then IN_PROGRESS, RESOLVED, CLOSED (enum order); newest activity first within each. */
  async adminList(q: AdminSupportQueryDto) {
    const search = q.search?.trim();
    const number = search ? ticketNumberFrom(search) : null;
    const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });
    const where: Prisma.SupportTicketWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.reason && { reason: q.reason }),
      ...(search &&
        (number !== null
          ? { OR: [{ ticketNumber: number }, { user: { phone: { contains: search } } }] }
          : {
              user: {
                OR: [
                  { firstName: contains(search) },
                  { lastName: contains(search) },
                  { email: contains(search) },
                  { phone: { contains: search } },
                ],
              },
            })),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: [{ status: 'asc' }, { [q.sortBy]: q.sortOrder }],
        select: ADMIN_LIST_SELECT,
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    const data = rows.map(({ messages, _count, ...t }) => ({
      ...t,
      messageCount: _count.messages,
      lastReplyFrom: messages[0] ? from(messages[0].senderRole) : null,
    }));
    return paginated(data, total, q.page, q.limit);
  }

  /** { OPEN, IN_PROGRESS, RESOLVED, CLOSED, ALL } — for tabs and the sidebar badge. */
  async adminCounts() {
    const groups = await this.prisma.supportTicket.groupBy({ by: ['status'], _count: { _all: true } });
    const out = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0, ALL: 0 };
    for (const g of groups) {
      out[g.status] = g._count._all;
      out.ALL += g._count._all;
    }
    return out;
  }

  async adminGet(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id }, select: ADMIN_DETAIL_SELECT });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async adminReply(adminId: string, id: string, body: string) {
    await this.reply({ id }, adminId, 'ADMIN', body, 'IN_PROGRESS');
    return this.adminGet(id);
  }

  async adminSetStatus(id: string, status: 'RESOLVED' | 'CLOSED') {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id }, select: { status: true } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'CLOSED') {
      if (status === 'CLOSED') return this.adminGet(id);
      throw new BadRequestException('Closed tickets cannot be changed');
    }
    await this.prisma.supportTicket.update({
      where: { id },
      data: { status, closedAt: status === 'CLOSED' ? new Date() : null },
    });
    return this.adminGet(id);
  }

  /* ───────────── Shared ───────────── */

  /**
   * Add a message and move the ticket to `nextStatus` in one transaction.
   * The status update only matches non-closed tickets, so a reply can't sneak in after closing.
   */
  private async reply(
    where: { id: string; userId?: string },
    senderId: string,
    senderRole: Role,
    body: string,
    nextStatus: SupportStatus,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.supportTicket.updateMany({
        where: { ...where, status: { not: 'CLOSED' } },
        data: { status: nextStatus, lastMessageAt: now },
      });
      if (count === 0) {
        const exists = await tx.supportTicket.findFirst({ where, select: { id: true } });
        if (!exists) throw new NotFoundException('Ticket not found');
        throw new BadRequestException(CLOSED_MESSAGE);
      }
      await tx.supportMessage.create({
        data: { ticketId: where.id, senderId, senderRole, body, createdAt: now },
      });
    });
  }
}
