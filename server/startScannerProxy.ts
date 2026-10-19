/// <reference types="node" />
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createScannerProxy, SCANNER_MAX_BODY_BYTES } from './cardsightProxy';
import { cardSightTransport } from './cardsightTransport';

type Handler = (request: Request) => Promise<Response>;

function reject(response: ServerResponse, status: number, code: string, message: string) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify({ error: { code, message } }));
}

async function dispatch(incoming: IncomingMessage, outgoing: ServerResponse, handler: Handler) {
  const declared = incoming.headers['content-length'];
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > SCANNER_MAX_BODY_BYTES)) {
    incoming.resume();
    reject(outgoing, 413, 'image_too_large', 'The image is too large.');
    return;
  }
  const controller = new AbortController();
  const abort = () => { controller.abort(); };
  incoming.once('aborted', abort);
  outgoing.once('close', () => { if (!outgoing.writableEnded) abort(); });
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of incoming) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.byteLength;
      if (size > SCANNER_MAX_BODY_BYTES) {
        reject(outgoing, 413, 'image_too_large', 'The image is too large.');
        incoming.resume();
        return;
      }
      chunks.push(bytes);
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    const method = incoming.method ?? 'GET';
    const request = new Request(new URL(incoming.url ?? '/', 'http://local-scanner.invalid'), {
      method, headers, signal: controller.signal,
      ...(method !== 'GET' && method !== 'HEAD' && size ? { body: Buffer.concat(chunks) } : {}),
    });
    const result = await handler(request);
    if (outgoing.destroyed) return;
    const responseHeaders: Record<string, string> = {};
    result.headers.forEach((value, key) => { responseHeaders[key] = value; });
    outgoing.writeHead(result.status, responseHeaders);
    outgoing.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    if (!outgoing.destroyed && !outgoing.headersSent) reject(outgoing, 500, 'server_error', 'The local scanner could not complete this request.');
  } finally { incoming.off('aborted', abort); }
}

/** Only a LAN testing adapter. Production needs TLS, authenticated users and durable quotas. */
export function createLocalScannerServer(handler: Handler) {
  const server = createServer((incoming, outgoing) => { void dispatch(incoming, outgoing, handler); });
  server.requestTimeout = 25_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5000;
  server.maxConnections = 8;
  return server;
}

function envNumber(value: string | undefined): number | undefined {
  return value && /^\d+$/.test(value) ? Number(value) : undefined;
}

export function startScannerProxy() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The local scanner proxy cannot run in production. Deploy an authenticated backend instead.');
  }
  const port = envNumber(process.env.SCANNER_PROXY_PORT) ?? 8787;
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('SCANNER_PROXY_PORT must be between 1024 and 65535.');
  const devToken = process.env.SCANNER_DEV_TOKEN || randomBytes(32).toString('base64url');
  const handler = createScannerProxy({
    apiKey: process.env.CARDSIGHT_API_KEY,
    transport: cardSightTransport,
    devToken,
    minIntervalMs: envNumber(process.env.SCANNER_MIN_INTERVAL_MS),
    maxRunRequests: envNumber(process.env.SCANNER_MAX_RUN_REQUESTS),
    tokenTtlMs: envNumber(process.env.SCANNER_TOKEN_TTL_MS),
    allowedOrigins: process.env.SCANNER_ALLOWED_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean),
  });
  const server = createLocalScannerServer(handler);
  server.on('error', () => {
    console.error('Local scanner server could not start. Check the port and local network permissions.');
    process.exitCode = 1;
  });
  server.listen(port, '0.0.0.0', () => {
    console.info('Chase scanner · LOCAL DEVELOPMENT ONLY · Keep this server on a trusted local network.');
    console.info(`Health: http://localhost:${port}/health`);
    for (const addresses of Object.values(networkInterfaces())) {
      for (const address of addresses ?? []) {
        if (address.family === 'IPv4' && !address.internal) console.info(`Phone server URL: http://${address.address}:${port}`);
      }
    }
    console.info(`Local pairing token (expires after 2 hours by default): ${devToken}`);
    console.info('Use that local token in EXPO_PUBLIC_SCANNER_TOKEN. Never use the CardSight API key there.');
    console.info('CardSight transport: POST /v1/identify/card. Health checks local configuration, not provider authentication.');
    if (!process.env.CARDSIGHT_API_KEY) console.info('CARDSIGHT_API_KEY is missing; recognition remains disabled.');
  });
  const shutdown = () => { server.close(); server.closeIdleConnections(); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  server.once('close', () => { process.off('SIGINT', shutdown); process.off('SIGTERM', shutdown); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { startScannerProxy(); }
  catch { console.error('Local scanner configuration is invalid. Check the server-only environment settings.'); process.exitCode = 1; }
}
