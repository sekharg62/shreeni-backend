import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module.js';
import { PincodesModule } from '../pincodes/pincodes.module.js';
import { AdminOrdersController } from './admin-orders.controller.js';
import { AdminOrdersService } from './admin-orders.service.js';
import { CheckoutController } from './checkout.controller.js';
import { MyOrdersController } from './my-orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [CartModule, PincodesModule],
  controllers: [CheckoutController, MyOrdersController, AdminOrdersController],
  providers: [OrdersService, AdminOrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
