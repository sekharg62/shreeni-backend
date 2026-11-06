import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { BannersService } from './banners.service.js';
import { PublicBannerDto } from './dto/public-banner.dto.js';

/** Storefront banners — no auth. */
@ApiTags('Storefront · Banners')
@Controller('banners')
export class PublicBannersController {
  constructor(private readonly banners: BannersService) {}

  /** Published banners in the order set in the admin. */
  @Get()
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOkResponse({ type: PublicBannerDto, isArray: true })
  list(): Promise<PublicBannerDto[]> {
    return this.banners.findPublished();
  }
}
