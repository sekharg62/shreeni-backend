import { Logger } from '@nestjs/common';
import { createApp } from './app.setup.js';

/** Local / long-running server. On Vercel, `api/index.js` serves the same app instead. */
async function bootstrap() {
  const app = await createApp();

  const port = process.env.PORT ?? 8080;
  await app.listen(port);

  Logger.log(`🚀 Server running on http://localhost:${port}`, 'Bootstrap');
  if (process.env.NODE_ENV !== 'production') {
    Logger.log(`📚 API docs on http://localhost:${port}/docs`, 'Bootstrap');
  }
}
await bootstrap();
