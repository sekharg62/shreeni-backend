import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Role } from '../../generated/prisma/enums.js';
import type { LoginDto } from './dto/login.dto.js';
import type { CustomerLoginDto, RegisterDto } from './dto/customer-auth.dto.js';
import { normalizeIndianPhone } from './phone.js';

const BCRYPT_ROUNDS = 12;

/** Columns returned to a signed-in customer — never the password hash. */
const CUSTOMER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
} as const;

type UserRow = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  role: Role;
  passwordHash: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /* ───────────── Admin ───────────── */

  /** Admin panel sign-in. Customer accounts are refused with the same message as a wrong password. */
  async loginAdmin(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user || user.role !== 'ADMIN' || !(await this.passwordOk(user, dto.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const auth_token = await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role });
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        // Kept for the admin UI, which displays a single full name.
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
        phone: user.phone,
        role: user.role,
      },
      auth_token,
    };
  }

  /* ───────────── Customers ───────────── */

  /** Create a customer account and sign it in. */
  async register(dto: RegisterDto) {
    const phone = normalizeIndianPhone(dto.phone);
    if (!phone) throw new BadRequestException('Enter a valid 10-digit Indian mobile number');

    // Friendly, field-specific messages (the unique constraints still guard races).
    const taken = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { phone }] },
      select: { email: true, phone: true },
    });
    if (taken?.email === dto.email) {
      throw new ConflictException('An account with this email already exists. Try signing in.');
    }
    if (taken?.phone === phone) {
      throw new ConflictException('An account with this mobile number already exists. Try signing in.');
    }

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName || null,
        email: dto.email,
        phone,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        role: 'CUSTOMER',
      },
      select: CUSTOMER_SELECT,
    });
    return { user, auth_token: await this.customerToken(user.id, user.email) };
  }

  /** Storefront sign-in with email or mobile. One message for every failure, so accounts can't be probed. */
  async loginCustomer(dto: CustomerLoginDto) {
    const id = dto.identifier;
    const phone = id.includes('@') ? null : normalizeIndianPhone(id);
    const where = id.includes('@') ? { email: id.toLowerCase() } : phone ? { phone } : null;

    const user = where ? await this.prisma.user.findUnique({ where }) : null;
    if (!user || user.role !== 'CUSTOMER' || !(await this.passwordOk(user, dto.password))) {
      throw new UnauthorizedException('Incorrect email/mobile number or password');
    }
    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
      },
      auth_token: await this.customerToken(user.id, user.email),
    };
  }

  /** The signed-in customer's profile. 401 if the account no longer exists. */
  async me(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: 'CUSTOMER' },
      select: CUSTOMER_SELECT,
    });
    if (!user) throw new UnauthorizedException('Please sign in again');
    return user;
  }

  /* ───────────── helpers ───────────── */

  private async passwordOk(user: UserRow, password: string): Promise<boolean> {
    // Accounts without a password (e.g. created another way) can't sign in with one.
    return !!user.passwordHash && bcrypt.compare(password, user.passwordHash);
  }

  private customerToken(id: string, email: string | null) {
    return this.jwt.signAsync(
      { sub: id, email, role: 'CUSTOMER' as const },
      // Customers stay signed in longer than admins.
      { expiresIn: (this.config.get<string>('jwt.customerExpiresIn') ?? '7d') as unknown as number },
    );
  }
}
