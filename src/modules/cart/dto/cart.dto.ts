import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { MAX_ORDERABLE } from '../../products/public-products.service.js';

/** Different sizes a cart can hold. */
export const MAX_CART_LINES = 50;

/* ───────────── Requests ───────────── */

/** `PUT /me/cart/items/:variantId` — set the quantity (0 removes). Capped at what's in stock. */
export class SetCartQuantityDto {
  @ApiProperty({ minimum: 0, maximum: MAX_ORDERABLE, example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_ORDERABLE)
  quantity!: number;
}

export class CartItemInputDto {
  @ApiProperty({ format: 'uuid', description: 'Product size (variant) id' })
  @IsUUID('all')
  variantId!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_ORDERABLE })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ORDERABLE)
  quantity!: number;
}

/** `POST /me/cart/merge` and `POST /cart/preview` */
export class CartItemsDto {
  @ApiProperty({ type: CartItemInputDto, isArray: true, maxItems: MAX_CART_LINES })
  @IsArray()
  @ArrayMaxSize(MAX_CART_LINES)
  @ValidateNested({ each: true })
  @Type(() => CartItemInputDto)
  items!: CartItemInputDto[];
}

/* ───────────── Responses ───────────── */

export const CART_ISSUES = ['OUT_OF_STOCK', 'QUANTITY_REDUCED', 'UNAVAILABLE'] as const;
export type CartIssue = (typeof CART_ISSUES)[number];

/** One size of one product, with today's price and stock. Prices are in paise. */
export class CartLineDto {
  @ApiProperty({ format: 'uuid' }) variantId!: string;
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) image!: string | null;
  @ApiProperty({ example: 'Free Size' }) size!: string;
  @ApiProperty({ description: 'What the customer pays per piece, in paise' }) price!: number;
  @ApiProperty({ type: Number, nullable: true, description: 'Struck-through price (paise) when on discount' })
  compareAtPrice!: number | null;
  @ApiProperty() quantity!: number;
  /** Most that can be ordered right now (0–10). */
  @ApiProperty({ minimum: 0, maximum: MAX_ORDERABLE }) available!: number;
  /**
   * null = fine. OUT_OF_STOCK = none left. QUANTITY_REDUCED = lowered to what's left (shown once).
   * UNAVAILABLE = product or size taken off sale.
   */
  @ApiProperty({ enum: CART_ISSUES, nullable: true, type: String }) issue!: CartIssue | null;
}

export class CartDto {
  @ApiProperty({ type: CartLineDto, isArray: true, description: 'In the order they were added' })
  items!: CartLineDto[];
  /** Pieces that can be bought now (lines without OUT_OF_STOCK / UNAVAILABLE). */
  @ApiProperty() itemCount!: number;
  /** In paise, for the purchasable lines. */
  @ApiProperty() subtotal!: number;
}
