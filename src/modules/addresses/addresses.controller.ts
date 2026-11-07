import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CustomerOnly } from '../../common/authz/customer-only.decorator.js';
import type { AuthenticatedRequest } from '../../common/authz/auth-user.js';
import { AddressesService } from './addresses.service.js';
import { AddressDto, CreateAddressDto, UpdateAddressDto } from './dto/address.dto.js';

/** The signed-in customer's saved delivery addresses. */
@ApiTags('Storefront · Addresses')
@CustomerOnly()
@Controller('me/addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOkResponse({ type: AddressDto, isArray: true })
  list(@Req() req: AuthenticatedRequest): Promise<AddressDto[]> {
    return this.addresses.list(req.user!.sub);
  }

  @Post()
  @ApiCreatedResponse({ type: AddressDto })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateAddressDto): Promise<AddressDto> {
    return this.addresses.create(req.user!.sub, dto);
  }

  /** Declared before ':id' so "default" isn't read as part of an id route. */
  @Patch(':id/default')
  @ApiOkResponse({ type: AddressDto, isArray: true, description: 'Updated list' })
  @ApiNotFoundResponse()
  setDefault(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<AddressDto[]> {
    return this.addresses.setDefault(req.user!.sub, id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AddressDto })
  @ApiNotFoundResponse()
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressDto> {
    return this.addresses.update(req.user!.sub, id, dto);
  }

  @Delete(':id')
  @ApiOkResponse({ type: AddressDto, isArray: true, description: 'Updated list' })
  @ApiNotFoundResponse()
  remove(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<AddressDto[]> {
    return this.addresses.remove(req.user!.sub, id);
  }
}
