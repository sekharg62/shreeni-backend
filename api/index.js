// Vercel serverless entry: every request is rewritten here (see vercel.json).
// It serves the compiled Nest app from dist/ (built by `npm run build` during deploy).
// The app is created once per warm instance and reused across requests.
import { createApp } from '../dist/app.setup.js';

let server;

async function getServer() {
  if (!server) {
    const app = await createApp();
    await app.init();
    server = app.getHttpAdapter().getInstance();
  }
  return server;
}

export default async function handler(req, res) {
  const app = await getServer();
  return app(req, res);
}
