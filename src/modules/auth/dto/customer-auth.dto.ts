import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Indian mobile in any common form: 9876543210, +91 98765 43210, 09876543210. */
export const PHONE_INPUT = /^(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}$/;

/** `POST /auth/register` */
export class RegisterDto {
  @ApiProperty({ example: 'Priya' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MaxLength(60)
  firstName!: string;

  @ApiPropertyOptional({ example: 'Sen' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @ApiProperty({ example: 'priya@example.com' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: '9876543210' })
  @Transform(trim)
  @Matches(PHONE_INPUT, { message: 'Enter a valid 10-digit Indian mobile number' })
  phone!: string;

  @ApiProperty({ minLength: 8, description: 'At least 8 characters, with a letter and a number' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password must be at most 72 characters' }) // bcrypt limit
  @Matches(/[A-Za-z]/, { message: 'Password must contain a letter' })
  @Matches(/\d/, { message: 'Password must contain a number' })
  password!: string;
}

/** `POST /auth/login` — customers only. */
export class CustomerLoginDto {
  @ApiProperty({ example: 'priya@example.com', description: 'Email or 10-digit mobile number' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Enter your email or mobile number' })
  @MaxLength(254)
  identifier!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Enter your password' })
  @MaxLength(128)
  password!: string;
}
