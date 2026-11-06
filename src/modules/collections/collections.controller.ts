import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import { UpdateActiveStatusDto } from '../../common/dto/common-body.dto.js';
import { CollectionsService } from './collections.service.js';
import {
  CreateCollectionDto,
  QueryCollectionDto,
  ReplaceCollectionDto,
  UpdateCollectionDto,
} from './dto/collection.dto.js';

@ApiTags('Admin · Collections')
@AdminOnly()
@Controller('admin/collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  findAll(@Query() query: QueryCollectionDto) {
    return this.collections.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.collections.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCollectionDto) {
    return this.collections.create(dto);
  }

  @Put(':id')
  replace(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceCollectionDto) {
    return this.collections.replace(id, dto);
  }

  @Patch(':id/status')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateActiveStatusDto) {
    return this.collections.setActive(id, dto.isActive);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCollectionDto) {
    return this.collections.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.collections.remove(id);
  }
}
