import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Req, StreamableFile } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import type { AuthenticatedRequest } from '../../common/authz/auth-user.js';
import { CustomerOnly } from '../../common/authz/customer-only.decorator.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard.js';
import { TrackOrderDto } from '../orders/dto/order.dto.js';
import { InvoicesService, type InvoiceFile } from './invoices.service.js';

/** PDF download; never cached (it can contain personal details). */
function download({ filename, pdf }: InvoiceFile): StreamableFile {
  return new StreamableFile(pdf, {
    type: 'application/pdf',
    disposition: `attachment; filename="${filename}"`,
    length: pdf.length,
  });
}

/** The signed-in customer's invoices. */
@ApiTags('Storefront · Checkout & Orders')
@CustomerOnly()
@Controller('me/orders')
export class MyInvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get(':orderNumber/invoice')
  @Header('Cache-Control', 'private, no-store')
  @RateLimit(30, 60_000)
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'The invoice as a PDF file' })
  @ApiBadRequestResponse({ description: 'Not confirmed yet (or cancelled before confirmation)' })
  @ApiNotFoundResponse()
  async mine(@Req() req: AuthenticatedRequest, @Param('orderNumber') orderNumber: string) {
    return download(await this.invoices.forCustomer(req.user!.sub, orderNumber));
  }
}

/** Guests: same order number + phone/email check as order tracking. */
@ApiTags('Storefront · Checkout & Orders')
@Controller('orders/track')
export class GuestInvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post('invoice')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(200)
  @RateLimit(10, 60_000)
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'The invoice as a PDF file' })
  @ApiBadRequestResponse({ description: 'Not confirmed yet (or cancelled before confirmation)' })
  @ApiNotFoundResponse({ description: 'No order with this number and phone/email' })
  async guest(@Body() dto: TrackOrderDto) {
    return download(await this.invoices.forGuest(dto));
  }
}

/** Admin: any order's invoice. */
@ApiTags('Admin · Orders')
@AdminOnly()
@Controller('admin/orders')
export class AdminInvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get(':id/invoice')
  @Header('Cache-Control', 'private, no-store')
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'The invoice as a PDF file' })
  @ApiBadRequestResponse({ description: 'Not confirmed yet' })
  async admin(@Param('id', ParseUUIDPipe) id: string) {
    return download(await this.invoices.forAdmin(id));
  }
}
