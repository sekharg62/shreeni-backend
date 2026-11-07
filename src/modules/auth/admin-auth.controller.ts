import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags, ApiTooManyRequestsResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';

/** Admin panel sign-in — ADMIN accounts only. */
@ApiTags('Admin · Auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit(10, 15 * 60_000)
  @ApiUnauthorizedResponse({ description: 'Wrong credentials (or not an admin)' })
  @ApiTooManyRequestsResponse({ description: 'Too many attempts' })
  login(@Body() dto: LoginDto) {
    return this.auth.loginAdmin(dto);
  }
}
