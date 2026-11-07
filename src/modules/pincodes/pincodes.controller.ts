import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard.js';
import { PincodeDto } from './pincode.dto.js';
import { PincodesService } from './pincodes.service.js';

/** PIN code lookup for address forms (autofill city and state). */
@ApiTags('Storefront · Pincodes')
@Controller('pincodes')
export class PincodesController {
  constructor(private readonly pincodes: PincodesService) {}

  @Get(':pincode')
  @RateLimit(120, 60_000)
  // PIN code data rarely changes: let browsers and the CDN keep answers for a day.
  @Header('Cache-Control', 'public, max-age=86400, s-maxage=86400')
  @ApiOkResponse({ type: PincodeDto })
  @ApiBadRequestResponse({ description: 'Not a 6-digit PIN code' })
  @ApiNotFoundResponse({ description: 'Unknown PIN code' })
  lookup(@Param('pincode') pincode: string): Promise<PincodeDto> {
    return this.pincodes.lookup(pincode);
  }
}
