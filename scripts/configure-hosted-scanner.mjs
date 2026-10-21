import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const project = 'vzjekkgyrdxzlhaupnrw';
const root = `https://api.supabase.com/v1/projects/${project}`;

/** Management API contract: supabase/apps/docs/spec/api_v1_openapi.json.
 * Runs only in the credential-scoped deployment step, never in the mobile app.
 */
export async function configureHostedScanner({ accessToken, baseMigration, accessMigration, fetcher = fetch }) {
  if (!accessToken) throw new Error('SUPABASE_ACCESS_TOKEN is required for deployment.');
  async function manage(path, method, body) {
    const response = await fetcher(root + path, { method, redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) {
      // Never log the provider response or credentials, even when config fails.
      throw new Error(`Supabase setup failed (${response.status}) at ${path}. Check token permissions for database queries and Auth configuration, then rerun deployment.`);
    }
    return response.json();
  }
  const installed = await manage('/database/query', 'POST', {
    query: "select to_regclass('public.scanner_service_limits') is not null as installed", read_only: true,
  });
  if (!Array.isArray(installed) || typeof installed[0]?.installed !== 'boolean') throw new Error('Unexpected Supabase schema check. No setup was attempted.');
  if (!installed[0].installed) await manage('/database/query', 'POST', { query: baseMigration });
  // Additive and repeatable: preserves collections, existing grants and usage.
  await manage('/database/query', 'POST', { query: accessMigration });
  const config = await manage('/config/auth', 'PATCH', { external_anonymous_users_enabled: true, security_manual_linking_enabled: true });
  if (config?.external_anonymous_users_enabled !== true || config?.security_manual_linking_enabled !== true) throw new Error('Supabase did not confirm guest sign-ins and account linking were enabled.');
}

async function main() {
  try {
    await configureHostedScanner({ accessToken: process.env.SUPABASE_ACCESS_TOKEN,
      baseMigration: await readFile(new URL('../supabase/migrations/202610210001_hosted_scanner.sql', import.meta.url), 'utf8'),
      accessMigration: await readFile(new URL('../supabase/migrations/202610210002_automatic_scanner_access.sql', import.meta.url), 'utf8'),
    });
    console.log('Scanner schema updated and guest sign-ins enabled. No manual account activation is required.');
  } catch (error) {
    // Only our own explicit errors are useful; raw fetch errors could contain URLs.
    const message = error instanceof Error && /^(Supabase setup failed|SUPABASE_ACCESS_TOKEN|Unexpected Supabase schema|Supabase did not confirm)/.test(error.message)
      ? error.message : 'Could not configure Supabase. Check deployment connectivity and token permissions.';
    console.error(message); process.exitCode = 1;
  }
}

if (basename(process.argv[1] ?? '') === 'configure-hosted-scanner.mjs') void main();
