import { createHostedScanner } from '../functions/_shared/hostedScanner.ts';
import type { ScannerOutcome } from '../functions/_shared/hostedProtocol.ts';

declare const Deno: { test(name: string, run: () => Promise<void>): void };

// Exercises actual Deno WebCrypto, Request/Response, base64 and shared imports.
// No network, env permissions, database or vendor credentials are required.
Deno.test('portable hosted scanner runs and replays its normalized receipt in Deno', async () => {
  const user = '12345678-1234-1234-1234-123456789abc';
  let saved: ScannerOutcome | undefined; let calls = 0;
  const handler = createHostedScanner({ configured: true, authenticate: async () => user,
    recognize: async () => { calls++; return { candidates: [] }; },
    store: { status: async () => ({ status: 200, body: { ready: true, mode: 'supabase-hosted' } }),
      claim: async (_user, _id, digest) => { if (digest.length !== 64) throw new Error('Invalid hash'); return saved ?? { lease: user }; },
      complete: async (_user, _id, _lease, outcome) => { saved = outcome; } },
  });
  const request = () => new Request('https://project.test/cardsight-scanner/recognize', { method: 'POST', headers: {
    Authorization: 'Bearer fixture-valid-account-session-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'deno-fixture-0001', image: { mimeType: 'image/jpeg', base64: btoa(String.fromCharCode(255,216,255,224,0,16,255,217)) } }) });
  const first = await handler(request()); const second = await handler(request());
  if (first.status !== 200 || second.status !== 200 || calls !== 1 || JSON.stringify(await second.json()) !== '{"candidates":[]}') throw new Error('Deno scanner replay failed.');
});
