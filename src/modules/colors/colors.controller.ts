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
import { ColorsService } from './colors.service.js';
import {
  CreateColorDto,
  QueryColorDto,
  ReplaceColorDto,
  UpdateColorDto,
} from './dto/color.dto.js';

@ApiTags('Admin · Colors')
@AdminOnly()
@Controller('admin/colors')
export class ColorsController {
  constructor(private readonly colors: ColorsService) {}

  @Get()
  findAll(@Query() query: QueryColorDto) {
    return this.colors.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.colors.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateColorDto) {
    return this.colors.create(dto);
  }

  @Put(':id')
  replace(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceColorDto) {
    return this.colors.replace(id, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateColorDto) {
    return this.colors.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.colors.remove(id);
  }
}
