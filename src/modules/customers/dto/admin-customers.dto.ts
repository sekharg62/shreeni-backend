import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export const CUSTOMER_SORTS = ['createdAt', 'orderCount', 'totalSpent', 'lastOrderAt'] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

/** `GET /admin/customers` — search matches name, email or phone. */
export class AdminCustomersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(CUSTOMER_SORTS)
  sortBy: CustomerSort = 'createdAt';
}
