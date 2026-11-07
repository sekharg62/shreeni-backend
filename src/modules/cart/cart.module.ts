import { Module } from '@nestjs/common';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';
import { PublicCartController } from './public-cart.controller.js';

@Module({
  controllers: [CartController, PublicCartController],
  providers: [CartService],
})
export class CartModule {}
