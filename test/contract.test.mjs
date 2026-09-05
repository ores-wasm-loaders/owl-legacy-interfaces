import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  manifestSchema,
  registrySchema,
  checkManifest,
  assertManifest,
  validateManifest,
  projectManifest,
  derivedId,
  typespecModels,
  jsonSchemaModels,
  witnessProjection,
  releaseUrl,
  preparableAssets,
  CONTRACT_VERSION,
} from '../index.mjs';

const here = new URL('.', import.meta.url).pathname;
const fixtures = join(here, '..', 'fixtures');
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const valid = readdirSync(join(fixtures, 'valid')).map((f) => load(join(fixtures, 'valid', f)));

test('every valid fixture satisfies the manifest contract', () => {
  assert.equal(valid.length, 3);
  for (const m of valid) {
    assert.deepEqual(checkManifest(m, manifestSchema), [], `${m.appId} should be valid`);
    assert.equal(m.contractVersion, CONTRACT_VERSION);
  }
});

test('each invalid fixture fails for its own stated reason', () => {
  const expectations = load(join(fixtures, 'invalid', 'expectations.json'));
  for (const [name, needle] of Object.entries(expectations)) {
    const errors = checkManifest(load(join(fixtures, 'invalid', `${name}.json`)), manifestSchema);
    assert.ok(errors.length, `${name} should have failed`);
    assert.ok(
      errors.some((e) => e.includes(needle)),
      `${name}: expected an error mentioning "${needle}", got:\n  ${errors.join('\n  ')}`,
    );
  }
});

test('the validator refuses a schema keyword it does not implement', () => {
  const sneaky = { type: 'object', properties: { a: { type: 'string', format: 'email' } } };
  const errors = validateManifest({ a: 'x' }, sneaky);
  assert.ok(errors.some((e) => e.includes('unsupported keyword `format`')));
});

test('assertManifest throws with every error, not just the first', () => {
  const broken = { ...valid[0], appId: 'Not Valid', entrypoints: [] };
  assert.throws(
    () => assertManifest(broken, manifestSchema),
    (err) => err.name === 'ManifestError' && err.errors.length >= 2,
  );
});

test('projection agrees with both registry authorities', () => {
  const tsp = typespecModels(readFileSync(join(here, '..', 'contracts/typespec/main.tsp'), 'utf8'));
  const js = jsonSchemaModels(registrySchema);
  assert.deepEqual([...tsp.keys()].sort(), ['WasmAsset', 'WasmEntrypoint', 'WasmPreparePolicy', 'WasmRelease']);
  for (const m of valid) {
    const rows = projectManifest(m, { publishedAt: '2026-09-05T00:00:00Z' });
    assert.deepEqual(witnessProjection(rows, tsp, js), [], `${m.appId} projection disagrees with the contract`);
    assert.equal(rows.WasmEntrypoint.length, m.entrypoints.length);
    assert.equal(rows.WasmAsset.length, m.assets.length);
    assert.equal(rows.WasmPreparePolicy[0].activation, m.activation.mode);
  }
});

test('projection is deterministic and keys releases by (appId, releaseId)', () => {
  const [m] = valid;
  const a = projectManifest(m, { publishedAt: '2026-09-05T00:00:00Z' });
  const b = projectManifest(m, { publishedAt: '2026-09-05T00:00:00Z' });
  assert.deepEqual(a, b);
  assert.notEqual(derivedId(m.appId, m.releaseId), derivedId(m.appId, 'other-release'));
  assert.match(a.WasmRelease[0].id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('release URLs cannot escape the release directory', () => {
  const [m] = valid;
  assert.equal(releaseUrl(m, 'main.dart.wasm'), `${m.baseUrl}main.dart.wasm`);
  assert.throws(() => releaseUrl(m, '../other/main.wasm'), /must not traverse/);
  assert.throws(() => releaseUrl(m, '/absolute.wasm'), /must be relative/);
});

test('preparable assets exclude lazy ones and keep entrypoints first', () => {
  const flutter = valid.find((m) => m.framework === 'flutter');
  const prep = preparableAssets(flutter);
  assert.equal(prep.filter((p) => p.stage === 'lazy').length, 0);
  assert.deepEqual(
    prep.slice(0, flutter.entrypoints.length).map((p) => p.path),
    flutter.entrypoints.map((e) => e.path),
  );
  const budget = prep.reduce((a, b) => a + b.bytes, 0);
  assert.ok(budget > 0);
});
