import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { OrderStatus, PaymentMethod, PaymentStatus, ShipmentStatus } from '../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { CreateAddressDto } from '../../addresses/dto/address.dto.js';
import { PHONE_INPUT } from '../../auth/dto/customer-auth.dto.js';
import { CartItemInputDto, CartLineDto, MAX_CART_LINES } from '../../cart/dto/cart.dto.js';
import { PAYMENT_OPTIONS, type PaymentOption } from '../payments/payment-provider.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const optionalText = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);

/* ═════════════ Requests ═════════════ */

class OrderItemsDto {
  @ApiProperty({ type: CartItemInputDto, isArray: true, minItems: 1, maxItems: MAX_CART_LINES })
  @IsArray()
  @ArrayMinSize(1, { message: 'Your cart is empty' })
  @ArrayMaxSize(MAX_CART_LINES)
  @ValidateNested({ each: true })
  @Type(() => CartItemInputDto)
  items!: CartItemInputDto[];

  @ApiPropertyOptional({ example: 'DIWALI20' })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  couponCode?: string;
}

/** `POST /checkout/quote` — live prices, coupon and totals for the checkout summary. Saves nothing. */
export class CheckoutQuoteRequestDto extends OrderItemsDto {}

export class GuestContactDto {
  @ApiProperty({ example: 'priya@example.com' })
  @Transform(trim)
  @IsEmail({}, { message: 'Enter a valid email for your order updates' })
  @MaxLength(150)
  email!: string;

  @ApiProperty({ example: '9876543210' })
  @Transform(trim)
  @Matches(PHONE_INPUT, { message: 'Enter a valid 10-digit mobile number' })
  phone!: string;

  @ApiProperty({ type: CreateAddressDto })
  @ValidateNested()
  @Type(() => CreateAddressDto)
  address!: CreateAddressDto;
}

/**
 * `POST /orders` — place an order. Signed in: send `addressId` (one of your saved addresses).
 * Guest: send `guest` (email, phone, address). Prices always come from the server.
 */
export class PlaceOrderDto extends OrderItemsDto {
  @ApiProperty({ enum: PAYMENT_OPTIONS })
  @IsIn(PAYMENT_OPTIONS, { message: 'Choose a payment method' })
  paymentMethod!: PaymentOption;

  @ApiProperty({ format: 'uuid', description: 'New per checkout attempt; resending it returns the same order' })
  @IsUUID('4')
  idempotencyKey!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  addressId?: string;

  @ApiPropertyOptional({ type: GuestContactDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GuestContactDto)
  guest?: GuestContactDto;
}

/** `POST /orders/track` — guests look an order up with its number + the phone or email used. */
export class TrackOrderDto {
  @ApiProperty({ example: 'OD261108482913' })
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  orderNumber!: string;

  @ApiProperty({ example: '9876543210', description: 'Mobile number or email given at checkout' })
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  contact!: string;
}

export class CancelOrderDto {
  @ApiPropertyOptional({ example: 'Ordered by mistake' })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class MyOrdersQueryDto extends PaginationQueryDto {}

export const ADMIN_ORDER_SORTS = ['createdAt', 'grandTotal'] as const;

export class AdminOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  /** Placed on/after (ISO date). */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Placed on/before (ISO date, inclusive of that whole day). */
  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(ADMIN_ORDER_SORTS)
  sortBy: (typeof ADMIN_ORDER_SORTS)[number] = 'createdAt';
}

/** `PATCH /admin/orders/:id/status` */
export class AdminOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  /** Shown to the customer on the order timeline. */
  @ApiPropertyOptional({ example: 'Packed with care' })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  /** Required when marking SHIPPED. */
  @ApiPropertyOptional({ example: 'Delhivery' })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  deliveryPartner?: string;

  @ApiPropertyOptional({ example: '1234567890123', description: 'Courier tracking (AWB) number' })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  awb?: string;
}

/* ═════════════ Responses (amounts in paise) ═════════════ */

export class AppliedCouponDto {
  @ApiProperty({ example: 'DIWALI20' }) code!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() discount!: number;
}

export class CheckoutQuoteDto {
  @ApiProperty({ type: CartLineDto, isArray: true }) items!: CartLineDto[];
  @ApiProperty() itemCount!: number;
  @ApiProperty() subtotal!: number;
  @ApiProperty() discountTotal!: number;
  @ApiProperty() shippingTotal!: number;
  @ApiProperty() grandTotal!: number;
  @ApiProperty({ type: AppliedCouponDto, nullable: true }) coupon!: AppliedCouponDto | null;
  /** Why the entered coupon wasn't applied (null when none was entered or it worked). */
  @ApiProperty({ type: String, nullable: true }) couponError!: string | null;
  /** false while some line is sold out / unavailable, or the cart is empty. */
  @ApiProperty() canPlaceOrder!: boolean;
  @ApiProperty({ type: Object, isArray: true, example: [{ value: 'TEST', label: 'Test payment (no money is charged)' }] })
  paymentOptions!: { value: PaymentOption; label: string }[];
}

export class OrderItemDto {
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Product page slug, null if the product was removed' })
  slug!: string | null;
  @ApiProperty({ type: String, nullable: true }) size!: string | null;
  @ApiProperty({ type: String, nullable: true }) image!: string | null;
  @ApiProperty() unitPrice!: number;
  @ApiProperty() quantity!: number;
  @ApiProperty() lineTotal!: number;
}

export class OrderAddressDto {
  @ApiProperty() receiverName!: string;
  @ApiProperty() receiverPhone!: string;
  @ApiProperty() flatHouseNo!: string;
  @ApiProperty({ type: String, nullable: true }) apartmentSector!: string | null;
  @ApiProperty({ type: String, nullable: true }) landmark!: string | null;
  @ApiProperty() city!: string;
  @ApiProperty() state!: string;
  @ApiProperty() pincode!: string;
  @ApiProperty() country!: string;
}

export class OrderPaymentDto {
  @ApiProperty({ enum: PaymentMethod }) method!: PaymentMethod;
  @ApiProperty({ example: 'test' }) provider!: string;
  @ApiProperty({ enum: PaymentStatus }) status!: PaymentStatus;
  @ApiProperty() amount!: number;
  @ApiProperty({ type: Date, nullable: true }) paidAt!: Date | null;
}

export class OrderShipmentDto {
  @ApiProperty() deliveryPartner!: string;
  @ApiProperty({ type: String, nullable: true }) awb!: string | null;
  @ApiProperty({ enum: ShipmentStatus }) status!: ShipmentStatus;
  @ApiProperty({ type: Date, nullable: true }) shippedAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true }) deliveredAt!: Date | null;
}

export class OrderEventDto {
  @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
  @ApiProperty({ example: 'Shipped' }) label!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() at!: Date;
}

export class OrderSummaryDto {
  @ApiProperty({ example: 'OD261108482913' }) orderNumber!: string;
  @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
  @ApiProperty() placedAt!: Date;
  @ApiProperty() grandTotal!: number;
  @ApiProperty() itemCount!: number;
  @ApiProperty({ type: OrderItemDto, isArray: true, description: 'Up to 3, for thumbnails' }) previewItems!: OrderItemDto[];
}

export class OrderDetailDto {
  @ApiProperty({ example: 'OD261108482913' }) orderNumber!: string;
  @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
  @ApiProperty() placedAt!: Date;
  @ApiProperty({ type: OrderItemDto, isArray: true }) items!: OrderItemDto[];
  @ApiProperty() itemCount!: number;
  @ApiProperty() subtotal!: number;
  @ApiProperty({ type: String, nullable: true }) discountCode!: string | null;
  @ApiProperty() discountTotal!: number;
  @ApiProperty() shippingTotal!: number;
  @ApiProperty() grandTotal!: number;
  @ApiProperty({ type: String, nullable: true }) contactEmail!: string | null;
  @ApiProperty() contactPhone!: string;
  @ApiProperty({ type: OrderAddressDto }) shippingAddress!: OrderAddressDto;
  @ApiProperty({ type: OrderPaymentDto, nullable: true }) payment!: OrderPaymentDto | null;
  @ApiProperty({ type: OrderShipmentDto, nullable: true }) shipment!: OrderShipmentDto | null;
  @ApiProperty({ type: OrderEventDto, isArray: true, description: 'Oldest first' }) timeline!: OrderEventDto[];
  @ApiProperty({ type: Date, nullable: true }) cancelledAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) cancelReason!: string | null;
  /** The customer can cancel it themselves right now. */
  @ApiProperty() canCancel!: boolean;

  @ApiProperty({ type: String, nullable: true, example: 'SHR/26-27/0001' })
  invoiceNumber!: string | null;

  @ApiProperty({ description: 'An invoice can be downloaded (the order was confirmed)' })
  hasInvoice!: boolean;
}

export class OrderPageDto {
  @ApiProperty({ type: OrderSummaryDto, isArray: true }) data!: OrderSummaryDto[];
  @ApiProperty({ type: Object, example: { page: 1, limit: 10, total: 3, totalPages: 1 } })
  meta!: { page: number; limit: number; total: number; totalPages: number };
}
