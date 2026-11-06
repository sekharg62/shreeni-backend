import { UseGuards, applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Roles, RolesGuard } from './roles.guard.js';

/**
 * Put on an admin controller: requires a valid JWT whose role is ADMIN.
 * 401 = no/invalid token, 403 = logged in but not an admin.
 */
export function AdminOnly() {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ADMIN'),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Missing or invalid token' }),
    ApiForbiddenResponse({ description: 'Not an admin' }),
  );
}
