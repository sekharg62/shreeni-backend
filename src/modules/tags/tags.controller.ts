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
import { TagsService } from './tags.service.js';
import {
  CreateTagDto,
  QueryTagDto,
  ReplaceTagDto,
  UpdateTagDto,
} from './dto/tag.dto.js';

@ApiTags('Admin · Tags')
@AdminOnly()
@Controller('admin/tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  findAll(@Query() query: QueryTagDto) {
    return this.tags.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tags.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTagDto) {
    return this.tags.create(dto);
  }

  @Put(':id')
  replace(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceTagDto) {
    return this.tags.replace(id, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTagDto) {
    return this.tags.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.tags.remove(id);
  }
}
