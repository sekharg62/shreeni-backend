// Vercel serverless entry: every request is rewritten here (see vercel.json).
// It serves the compiled Nest app from dist/ (built by `npm run build` during deploy).
// The app is created once per warm instance and reused across requests.

let server;
let starting;

/** Start the app once; if it fails, the next request tries again. */
function getServer() {
  if (server) return Promise.resolve(server);
  starting ??= (async () => {
    // Imported here (not at the top) so import-time failures are caught and reported too.
    const { createApp } = await import('../dist/app.setup.js');
    const app = await createApp();
    await app.init();
    server = app.getHttpAdapter().getInstance();
    return server;
  })().catch((err) => {
    starting = undefined;
    throw err;
  });
  return starting;
}

export default async function handler(req, res) {
  let app;
  try {
    app = await getServer();
  } catch (err) {
    // Full details go to Vercel → Logs; the response says why without leaking secrets.
    console.error('[startup] The API failed to start:', err);
    const reason = String(err?.message ?? err)
      .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, '$1***@') // never echo DB credentials
      .slice(0, 1500);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ statusCode: 503, error: 'API failed to start', reason }));
    return;
  }
  return app(req, res);
}
