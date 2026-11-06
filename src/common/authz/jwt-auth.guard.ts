import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser, AuthenticatedRequest } from './auth-user.js';

/** Verifies `Authorization: Bearer <token>` and attaches the payload to req.user. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;

    if (!value?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed auth token');
    }

    try {
      req.user = await this.jwt.verifyAsync<AuthUser>(value.slice(7).trim());
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired auth token');
    }
  }
}
