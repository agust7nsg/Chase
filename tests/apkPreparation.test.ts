import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('APK preparation works without env files and never copies workstation/vendor secrets into the build', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chase-installed-apk-'));
  try {
    await mkdir(join(root, 'scripts')); await mkdir(join(root, 'src/config'), { recursive: true });
    await copyFile('scripts/prepare-apk.mjs', join(root, 'scripts/prepare-apk.mjs'));
    await writeFile(join(root, 'src/config/publicProject.json'), JSON.stringify({ url: 'https://vzjekkgyrdxzlhaupnrw.supabase.co', publishableKey: 'sb_publishable_fixture-only-12345' }));
    await copyFile('eas.json', join(root, 'eas.json'));
    execFileSync(process.execPath, [join(root, 'scripts/prepare-apk.mjs')], { env: { NODE_ENV: 'test', PATH: process.env.PATH, CARDSIGHT_API_KEY: 'private-fixture-never-bundle', EXPO_PUBLIC_SCANNER_URL: 'http://192.168.1.2:8787', EXPO_PUBLIC_SCANNER_TOKEN: 'old-pairing' } });
    const text = await readFile(join(root, 'eas.json'), 'utf8'); const config = JSON.parse(text);
    assert.equal(config.build.preview.env.EXPO_PUBLIC_SCANNER_BACKEND, 'supabase');
    assert.equal(config.build.preview.env.EXPO_PUBLIC_ENABLE_PRO_SIMULATION, 'true');
    assert.equal(config.build.production.env.EXPO_PUBLIC_SCANNER_BACKEND, 'supabase');
    assert.ok(!text.includes('192.168')); assert.ok(!text.includes('private-fixture')); assert.ok(!text.includes('old-pairing'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
