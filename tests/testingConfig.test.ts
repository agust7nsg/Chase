import assert from 'node:assert/strict';
import test from 'node:test';
import { allowProSimulation } from '../src/config/testing';
test('Pro simulation works in development and explicit test APKs without enabling ordinary release builds', () => {
  assert.equal(allowProSimulation(true), true);
  assert.equal(allowProSimulation(false, 'true'), true);
  for (const value of [undefined, '', 'false', '1', 'TRUE']) assert.equal(allowProSimulation(false, value), false);
});
