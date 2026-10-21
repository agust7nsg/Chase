import { createHostedScanner } from '../_shared/hostedScanner.ts';
import { cardSightTransport } from '../_shared/cardsightTransport.ts';
import { supabaseScannerDependencies } from '../_shared/supabaseScannerStore.ts';

// The real Deno global is provided by the Supabase Edge Runtime. This narrow
// declaration also lets the repository's TypeScript check validate this entrypoint.
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const apiKey = Deno.env.get('CARDSIGHT_API_KEY');
const dependencies = url && serviceKey ? supabaseScannerDependencies(url, serviceKey) : null;
const handler = dependencies ? createHostedScanner({ ...dependencies, configured: Boolean(apiKey),
  allowedOrigins: (Deno.env.get('SCANNER_ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean),
  recognize: (jpeg, signal) => cardSightTransport(jpeg, { apiKey: apiKey!, signal, fetch }),
}) : async () => Response.json({ error: { code: 'not_configured' } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

Deno.serve(handler);
