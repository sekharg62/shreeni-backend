import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type PrismaKnownError = {
  code: string;
  clientVersion: string;
  meta?: Record<string, unknown>;
};

function isPrismaKnownError(e: unknown): e is PrismaKnownError {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as PrismaKnownError).code === 'string' &&
    /^P\d{4}$/.test((e as PrismaKnownError).code) &&
    'clientVersion' in e
  );
}

/** Best-effort name of the field(s)/constraint involved (shape differs with driver adapters). */
function prismaFields(e: PrismaKnownError): string | undefined {
  const meta = e.meta ?? {};
  const target = meta.target;
  if (Array.isArray(target)) return target.join(', ');
  if (typeof target === 'string') return target;
  const cause = (meta.driverAdapterError as { cause?: Record<string, unknown> })
    ?.cause;
  const constraint = cause?.constraint as
    | { fields?: string[]; index?: string }
    | undefined;
  if (constraint?.fields?.length) return constraint.fields.join(', ');
  if (constraint?.index) {
    // Postgres index names look like "Tag_slug_key" / "ProductVariant_productId_size_key".
    const m = /^[A-Za-z]+_(.+)_(?:key|fkey)$/.exec(constraint.index);
    return m ? m[1].split('_').join(', ') : constraint.index;
  }
  if (typeof meta.field_name === 'string') return meta.field_name;
  return undefined;
}

/** Translate Prisma's known errors into proper HTTP errors instead of a 500. */
function mapPrismaError(e: PrismaKnownError): [number, string, string] | null {
  const fields = prismaFields(e);
  switch (e.code) {
    case 'P2002':
      return [
        HttpStatus.CONFLICT,
        'Conflict',
        `A record with this ${fields ?? 'value'} already exists.`,
      ];
    case 'P2025':
      return [HttpStatus.NOT_FOUND, 'Not Found', 'Record not found.'];
    case 'P2003':
    case 'P2014':
      return [
        HttpStatus.CONFLICT,
        'Conflict',
        `This change conflicts with related records${fields ? ` (${fields})` : ''}: ` +
          'it is still in use, or it points to a record that does not exist.',
      ];
    case 'P2000':
      return [HttpStatus.BAD_REQUEST, 'Bad Request', 'A value is too long.'];
    case 'P2006':
    case 'P2007':
    case 'P2023':
      return [HttpStatus.BAD_REQUEST, 'Bad Request', 'A value has an invalid format.'];
    default:
      return null;
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: unknown =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const mapped = isPrismaKnownError(exception) ? mapPrismaError(exception) : null;
    if (mapped) {
      const [code, error, text] = mapped;
      status = code;
      message = { message: text, error, statusCode: code };
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      message,
    });
  }
}
