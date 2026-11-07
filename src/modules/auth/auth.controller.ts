import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/authz/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../../common/authz/auth-user.js';
import { AuthService } from './auth.service.js';
import { CustomerLoginDto, RegisterDto } from './dto/customer-auth.dto.js';

/** Storefront customer accounts. */
@ApiTags('Storefront · Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 10, ttl: 15 * 60_000 } })
  @ApiConflictResponse({ description: 'Email or mobile already registered' })
  @ApiTooManyRequestsResponse({ description: 'Too many attempts' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 10, ttl: 15 * 60_000 } })
  @ApiUnauthorizedResponse({ description: 'Wrong credentials (or not a customer account)' })
  @ApiTooManyRequestsResponse({ description: 'Too many attempts' })
  login(@Body() dto: CustomerLoginDto) {
    return this.auth.loginCustomer(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'The signed-in customer' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired token' })
  me(@Req() req: AuthenticatedRequest) {
    return this.auth.me(req.user!.sub);
  }
}
