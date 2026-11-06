import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validate and strip request payloads against the DTOs.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Allow the storefront and admin apps to call this API.
  const corsOrigins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });

  // Interactive API docs at /docs (disabled in production).
  if (process.env.NODE_ENV !== 'production') {
    const docConfig = new DocumentBuilder()
      .setTitle('Shreeni API')
      .setDescription('Admin + storefront API for the Shreeni saree store')
      .setVersion('0.0.1')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, docConfig));
  }

  const port = process.env.PORT ?? 8080;
  await app.listen(port);

  Logger.log(`🚀 Server running on http://localhost:${port}`, 'Bootstrap');
  if (process.env.NODE_ENV !== 'production') {
    Logger.log(`📚 API docs on http://localhost:${port}/docs`, 'Bootstrap');
  }
}
await bootstrap();
