/* eslint-disable @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers (expect.any …) are typed `any` */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { MAX_ACTIVE_TICKETS } from './dto/support.dto.js';
import { SupportService } from './support.service.js';

const USER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const TICKET = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-07T10:00:00Z');

const detailRow = (messages: { senderRole: 'CUSTOMER' | 'ADMIN'; body: string }[] = [], status = 'OPEN') => ({
  id: TICKET,
  ticketNumber: 1001,
  reason: 'DELIVERY',
  status,
  description: 'My parcel has not arrived after ten days.',
  lastMessageAt: NOW,
  createdAt: NOW,
  closedAt: null,
  messages: messages.map((m, i) => ({ id: `m${i}`, createdAt: NOW, ...m })),
});

function setup() {
  const supportTicket = {
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue(detailRow()),
    findFirst: vi.fn().mockResolvedValue(detailRow()),
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn(),
    groupBy: vi.fn(),
  };
  const supportMessage = { create: vi.fn() };
  const prisma = {
    supportTicket,
    supportMessage,
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)({ supportTicket, supportMessage })
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  return { prisma, service: new SupportService(prisma as unknown as PrismaService) };
}

describe('SupportService', () => {
  describe('create', () => {
    it('creates an OPEN ticket for the customer', async () => {
      const { prisma, service } = setup();
      const t = await service.create(USER, { reason: 'DELIVERY', description: 'My parcel has not arrived after ten days.' });
      expect(prisma.supportTicket.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { userId: USER, reason: 'DELIVERY', description: 'My parcel has not arrived after ten days.' } }),
      );
      expect(t).toMatchObject({ ticketNumber: 1001, status: 'OPEN', messages: [], lastReplyFrom: null });
    });

    it('refuses when the customer already has the maximum open tickets', async () => {
      const { prisma, service } = setup();
      prisma.supportTicket.count.mockResolvedValue(MAX_ACTIVE_TICKETS);
      await expect(service.create(USER, { reason: 'OTHER', description: 'x'.repeat(30) })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.supportTicket.count).toHaveBeenCalledWith({ where: { userId: USER, status: { not: 'CLOSED' } } });
      expect(prisma.supportTicket.create).not.toHaveBeenCalled();
    });
  });

  describe('getMine', () => {
    it('only looks in the caller’s own tickets and hides admin identities', async () => {
      const { prisma, service } = setup();
      prisma.supportTicket.findFirst.mockResolvedValue(
        detailRow([
          { senderRole: 'ADMIN', body: 'Sorry! Checking with the courier.' },
          { senderRole: 'CUSTOMER', body: 'Thanks' },
        ]),
      );
      const t = await service.getMine(USER, TICKET);
      expect(prisma.supportTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: TICKET, userId: USER } }));
      expect(t.messages.map((m) => m.from)).toEqual(['SUPPORT', 'CUSTOMER']);
      expect(t.lastReplyFrom).toBe('CUSTOMER');
      expect(JSON.stringify(t)).not.toContain('sender');
    });

    it("404s for another customer's ticket", async () => {
      const { prisma, service } = setup();
      prisma.supportTicket.findFirst.mockResolvedValue(null);
      await expect(service.getMine(USER, TICKET)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('replies and status', () => {
    it('a customer reply reopens the ticket (OPEN) and is scoped to the owner', async () => {
      const { prisma, service } = setup();
      await service.replyAsCustomer(USER, TICKET, 'Any update?');
      expect(prisma.supportTicket.updateMany).toHaveBeenCalledWith({
        where: { id: TICKET, userId: USER, status: { not: 'CLOSED' } },
        data: { status: 'OPEN', lastMessageAt: expect.any(Date) },
      });
      expect(prisma.supportMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ticketId: TICKET, senderId: USER, senderRole: 'CUSTOMER', body: 'Any update?' }),
      });
    });

    it('an admin reply moves the ticket to IN_PROGRESS', async () => {
      const { prisma, service } = setup();
      prisma.supportTicket.findUnique.mockResolvedValue(detailRow());
      await service.adminReply(ADMIN, TICKET, 'On it!');
      expect(prisma.supportTicket.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: TICKET, status: { not: 'CLOSED' } }, data: expect.objectContaining({ status: 'IN_PROGRESS' }) }),
      );
      expect(prisma.supportMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ senderId: ADMIN, senderRole: 'ADMIN' }),
      });
    });

    it('nobody can reply to a closed ticket', async () => {
      const { prisma, service } = setup();
      prisma.supportTicket.updateMany.mockResolvedValue({ count: 0 });
      prisma.supportTicket.findFirst.mockResolvedValue({ id: TICKET }); // exists, but closed
      await expect(service.replyAsCustomer(USER, TICKET, 'Hello?')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.supportMessage.create).not.toHaveBeenCalled();
    });

    it("replying to someone else's ticket is a 404, not a 400", async () => {
      const { prisma, service } = setup();
      prisma.supportTicket.updateMany.mockResolvedValue({ count: 0 });
      prisma.supportTicket.findFirst.mockResolvedValue(null);
      await expect(service.replyAsCustomer(USER, TICKET, 'Hello?')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('closing sets closedAt and only touches the owner’s ticket', async () => {
      const { prisma, service } = setup();
      await service.closeMine(USER, TICKET);
      expect(prisma.supportTicket.updateMany).toHaveBeenCalledWith({
        where: { id: TICKET, userId: USER, status: { not: 'CLOSED' } },
        data: { status: 'CLOSED', closedAt: expect.any(Date) },
      });
    });

    it('admins cannot reopen a closed ticket by resolving it', async () => {
      const { prisma, service } = setup();
      prisma.supportTicket.findUnique.mockResolvedValue({ status: 'CLOSED' });
      await expect(service.adminSetStatus(TICKET, 'RESOLVED')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.supportTicket.update).not.toHaveBeenCalled();
    });

    it('resolving keeps closedAt empty', async () => {
      const { prisma, service } = setup();
      prisma.supportTicket.findUnique.mockResolvedValueOnce({ status: 'IN_PROGRESS' }).mockResolvedValueOnce(detailRow());
      await service.adminSetStatus(TICKET, 'RESOLVED');
      expect(prisma.supportTicket.update).toHaveBeenCalledWith({ where: { id: TICKET }, data: { status: 'RESOLVED', closedAt: null } });
    });
  });

  describe('adminList search', () => {
    it.each(['SUP-1042', 'sup1042', '1042'])('"%s" searches by ticket number', async (search) => {
      const { prisma, service } = setup();
      prisma.supportTicket.count.mockResolvedValue(0);
      await service.adminList({ search, page: 1, limit: 20, sortBy: 'lastMessageAt', sortOrder: 'desc' });
      expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ ticketNumber: 1042 }, { user: { phone: { contains: search } } }] },
          orderBy: [{ status: 'asc' }, { lastMessageAt: 'desc' }],
        }),
      );
    });

    it('text searches the customer’s name, email and phone', async () => {
      const { prisma, service } = setup();
      prisma.supportTicket.count.mockResolvedValue(0);
      await service.adminList({ search: 'priya', status: 'OPEN', page: 1, limit: 20, sortBy: 'lastMessageAt', sortOrder: 'desc' });
      const { where } = prisma.supportTicket.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(where.status).toBe('OPEN');
      expect(JSON.stringify(where.user)).toContain('"firstName":{"contains":"priya","mode":"insensitive"}');
    });
  });

  it('adminCounts totals every status', async () => {
    const { prisma, service } = setup();
    prisma.supportTicket.groupBy.mockResolvedValue([
      { status: 'OPEN', _count: { _all: 3 } },
      { status: 'CLOSED', _count: { _all: 2 } },
    ]);
    await expect(service.adminCounts()).resolves.toEqual({ OPEN: 3, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 2, ALL: 5 });
  });
});
