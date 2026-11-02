import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSupabaseConfig } from '../src/services/auth/config';
import { resolveScannerConfig, isHostedScanner } from '../src/services/cardsight/config';
import project from '../src/config/publicProject.json';

test('an installed build without env files has matching hosted Auth and scanner configuration', () => {
  const auth = resolveSupabaseConfig();
  const scanner = resolveScannerConfig({ development: false });
  assert.equal(auth?.url, project.url); assert.ok(isHostedScanner(scanner));
  if (!isHostedScanner(scanner)) throw new Error('Hosted scanner missing');
  assert.equal(scanner.proxyUrl, `${auth!.url}/functions/v1/cardsight-scanner`);
  assert.equal(scanner.publishableKey, auth?.publishableKey);
  assert.match(scanner.publishableKey, /^sb_publishable_/);
  assert.ok(!/localhost|192\.168|127\.0\.0\.1/.test(scanner.proxyUrl));
});
test('obsolete pairing URLs and local tokens cannot send any installed release to a PC', () => {
  for (const backend of [undefined, '', 'supabase', 'local']) {
    const scanner = resolveScannerConfig({ development: false, backend, localUrl: 'http://192.168.100.66:8787', localToken: 'expired-pairing-token' });
    assert.ok(isHostedScanner(scanner));
  }
});
test('development also defaults to hosted; local proxy requires explicit selection and valid pairing', () => {
  const pairing = { development: true, localUrl: 'http://192.168.100.66:8787', localToken: 'test-local-token' };
  assert.ok(isHostedScanner(resolveScannerConfig(pairing)));
  assert.equal(resolveScannerConfig({ ...pairing, backend: 'local' })?.proxyUrl, pairing.localUrl);
  assert.equal(resolveScannerConfig({ ...pairing, backend: 'local', localToken: '' }), null);
});
test('incomplete overrides and private keys fail closed without changing projects or targeting a PC', () => {
  assert.equal(resolveSupabaseConfig(project.url), null);
  assert.equal(resolveSupabaseConfig(undefined, project.publishableKey), null);
  for (const key of ['sb_secret_private-do-not-use', 'service_role']) {
    assert.equal(resolveScannerConfig({ development: false, url: project.url, publishableKey: key }), null);
  }
  assert.equal(resolveScannerConfig({ development: false, backend: 'typo' }), null);
});
