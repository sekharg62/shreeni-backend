import { Module } from '@nestjs/common';
import { HomePicksController } from './home-picks.controller.js';
import { HomePicksService } from './home-picks.service.js';
import { PublicHomePicksController } from './public-home-picks.controller.js';

@Module({
  controllers: [HomePicksController, PublicHomePicksController],
  providers: [HomePicksService],
})
export class HomePicksModule {}
