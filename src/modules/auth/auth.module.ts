import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminAuthController } from './admin-auth.controller.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [
    // Rate limits for sign-in / sign-up only (applied per route with ThrottlerGuard).
    ThrottlerModule.forRoot([{ name: 'auth', ttl: 15 * 60_000, limit: 10 }]),
    // Global so the admin guard (src/common/authz) can verify tokens in every module.
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: {
          // jsonwebtoken types expiresIn as number | ms-string; cast the env value.
          expiresIn: (config.get<string>('jwt.expiresIn') ??
            '1d') as unknown as number,
        },
      }),
    }),
  ],
  controllers: [AuthController, AdminAuthController],
  providers: [AuthService],
})
export class AuthModule {}
