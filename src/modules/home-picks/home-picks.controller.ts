import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import { ReorderDto } from '../../common/dto/common-body.dto.js';
import { CreateHomePickDto, HomePickDto, UpdateHomePickDto } from './dto/home-pick.dto.js';
import { HomePicksService } from './home-picks.service.js';

/** Homepage "Handpicked for You" list. Small (max 24), so not paginated. */
@ApiTags('Admin · Homepage picks')
@AdminOnly()
@Controller('admin/home-picks')
export class HomePicksController {
  constructor(private readonly picks: HomePicksService) {}

  @Get()
  @ApiOkResponse({ type: HomePickDto, isArray: true })
  findAll() {
    return this.picks.findAll();
  }

  @Post()
  @ApiOkResponse({ type: HomePickDto })
  create(@Body() dto: CreateHomePickDto) {
    return this.picks.create(dto);
  }

  /** Declared before ':id' routes so "reorder" isn't parsed as an id. */
  @Patch('reorder')
  @ApiOkResponse({ type: HomePickDto, isArray: true })
  reorder(@Body() dto: ReorderDto) {
    return this.picks.reorder(dto.ids);
  }

  @Patch(':id')
  @ApiOkResponse({ type: HomePickDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHomePickDto) {
    return this.picks.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.picks.remove(id);
  }
}
