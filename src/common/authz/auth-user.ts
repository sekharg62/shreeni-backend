import type { Role } from '../../generated/prisma/enums.js';

/** Payload signed into the JWT by AuthService.login and attached to req.user. */
export interface AuthUser {
  sub: string; // user id
  email: string | null;
  role: Role;
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}
