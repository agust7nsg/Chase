import assert from 'node:assert/strict';
import test from 'node:test';
import { setLogoSources, usesAnniversaryBranding } from '../src/services/tcgdex/artwork';

test('extensionless set branding tries PNG after WebP, ahead of the symbol', () => {
  assert.deepEqual(setLogoSources({ id: '30th', name: '30th Celebration', logo: 'https://assets.tcgdex.net/en/me/30th/logo', symbol: 'https://assets.tcgdex.net/univ/me/30th/symbol' }), [
    'https://assets.tcgdex.net/en/me/30th/logo.webp', 'https://assets.tcgdex.net/en/me/30th/logo.png',
    'https://assets.tcgdex.net/univ/me/30th/symbol.webp', 'https://assets.tcgdex.net/univ/me/30th/symbol.png',
  ]);
  assert.deepEqual(setLogoSources({ id: 'test', name: 'Test', logo: 'https://example.com/logo.png' }), ['https://example.com/logo.png']);
  assert.deepEqual(setLogoSources({ id: 'test', name: 'Test', logo: 'http://example.com/logo', symbol: 'not a URL' }), []);
  assert.equal(usesAnniversaryBranding('30th'), true);
  assert.equal(usesAnniversaryBranding('30th-c'), true);
  assert.equal(usesAnniversaryBranding('base1'), false);
});
