import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PublicProductCardDto } from '../../products/dto/public-product.dto.js';
import { MAX_HOME_PICKS } from '../home-pick-visibility.js';

/** `GET /home-picks?limit=8` */
export class PublicHomePickQueryDto {
  @ApiPropertyOptional({ default: 8, minimum: 1, maximum: MAX_HOME_PICKS })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_HOME_PICKS)
  limit: number = 8;
}

/** A homepage pick: the usual product card plus its optional ribbon. */
export class PublicHomePickDto extends PublicProductCardDto {
  @ApiProperty({ type: String, nullable: true, example: 'Customer favourite' })
  badge!: string | null;
}
