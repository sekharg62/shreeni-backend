import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PublicHomePickDto, PublicHomePickQueryDto } from './dto/public-home-pick.dto.js';
import { HomePicksService } from './home-picks.service.js';

/** Storefront homepage picks — no auth. */
@ApiTags('Storefront · Homepage picks')
@Controller('home-picks')
export class PublicHomePicksController {
  constructor(private readonly picks: HomePicksService) {}

  /** Live picks in admin order, as product cards with an optional badge. */
  @Get()
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOkResponse({ type: PublicHomePickDto, isArray: true })
  list(@Query() q: PublicHomePickQueryDto): Promise<PublicHomePickDto[]> {
    return this.picks.findPublic(q.limit);
  }
}
