import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, UseGuards, applyDecorators } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { AuthUser, AuthenticatedRequest } from './auth-user.js';

/**
 * Sign-in optional: without a token the request continues as a guest (req.user unset);
 * with a token it must be valid (a bad or expired token is a 401, never a silent guest).
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    if (!value) return true;
    if (!value.startsWith('Bearer ')) throw new UnauthorizedException('Malformed auth token');
    try {
      req.user = await this.jwt.verifyAsync<AuthUser>(value.slice(7).trim());
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired auth token');
    }
  }
}

/** Put on routes that work for guests and signed-in customers alike (checkout, order placement). */
export function OptionalAuth() {
  return applyDecorators(UseGuards(OptionalJwtAuthGuard), ApiBearerAuth());
}
