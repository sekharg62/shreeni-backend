import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { AdminInvoicesController, GuestInvoicesController, MyInvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';

/** GST invoices (PDF) for confirmed orders: customers, guests (order tracking) and the admin. */
@Module({
  imports: [OrdersModule],
  controllers: [MyInvoicesController, GuestInvoicesController, AdminInvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
