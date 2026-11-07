import { UseGuards, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Roles, RolesGuard } from './roles.guard.js';

/**
 * Put on a storefront controller/route: requires a valid JWT whose role is CUSTOMER.
 * 401 = no/invalid token, 403 = signed in but not a customer (e.g. an admin token).
 */
export function CustomerOnly() {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('CUSTOMER'),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Missing or invalid token' }),
    ApiForbiddenResponse({ description: 'Not a customer account' }),
  );
}
