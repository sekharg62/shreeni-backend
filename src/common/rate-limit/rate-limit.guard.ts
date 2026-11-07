import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  applyDecorators,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/*
 * A small in-memory rate limiter (replaces @nestjs/throttler, whose CommonJS build
 * can't load the ESM-only @nestjs/common v12 on every Node runtime, e.g. on Vercel).
 *
 * Fixed window per route + client IP. State lives in this process, so on serverless
 * each warm instance counts on its own: a soft limit against abuse, not a hard quota.
 */

const RATE_LIMIT_KEY = 'rateLimit';

type RateLimitOptions = { limit: number; ttlMs: number };
type Window = { count: number; resetAt: number };

/** Sweep expired windows once the map grows past this. */
const SWEEP_AT = 10_000;

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}
interface ResponseLike {
  setHeader(name: string, value: string | number): void;
}

/** The client's IP. On Vercel/behind a proxy, the first x-forwarded-for entry is set by the platform. */
function clientIp(req: RequestLike): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.ip || req.socket?.remoteAddress || 'unknown';
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const http = context.switchToHttp();
    const req = http.getRequest<RequestLike>();
    const res = http.getResponse<ResponseLike>();
    const now = Date.now();
    const key = `${context.getClass().name}.${context.getHandler().name}:${clientIp(req)}`;

    if (this.windows.size > SWEEP_AT) {
      for (const [k, w] of this.windows) if (w.resetAt <= now) this.windows.delete(k);
    }

    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + options.ttlMs };
      this.windows.set(key, window);
    }
    window.count += 1;

    const remaining = Math.max(0, options.limit - window.count);
    const retryAfter = Math.ceil((window.resetAt - now) / 1000);
    res.setHeader('X-RateLimit-Limit', options.limit);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', retryAfter);

    if (window.count > options.limit) {
      res.setHeader('Retry-After', retryAfter);
      throw new HttpException('Too many requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}

/**
 * Limit a route to `limit` requests per `ttlMs` per client IP.
 *   @RateLimit(10, 15 * 60_000)
 * Put it before auth guards in the decorator list so floods are rejected cheaply.
 */
export function RateLimit(limit: number, ttlMs: number) {
  return applyDecorators(SetMetadata(RATE_LIMIT_KEY, { limit, ttlMs } satisfies RateLimitOptions), UseGuards(RateLimitGuard));
}
