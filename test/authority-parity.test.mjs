// The two authorities are peers: neither is generated from the other, so something has to
// prove they say the same thing. ORESoftware/ores-contracts is that something.
//
// It is a zed dependency of this repo. When it is resolvable (a `zed install`, or the sibling
// ~/codes/oresoftware checkout the runner has) this test performs the real parity check.
// When it is not, it says so loudly rather than passing quietly — the structural witness in
// contract.test.mjs still runs and is not a substitute.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const here = new URL('.', import.meta.url).pathname;
const CANDIDATES = [
  join(here, '..', '.vendor/.zed/ores-contracts/src'),
  join(here, '..', '..', '..', 'oresoftware', 'ores-contracts', 'src'),
  join(here, '..', '..', '..', 'ORESoftware', 'ores-contracts', 'src'),
];

test('the TypeSpec and JSON Schema authorities parse to the same contract', async (t) => {
  const src = CANDIDATES.find((p) => existsSync(p));
  if (!src) {
    t.diagnostic(`ores-contracts not resolvable — parity NOT verified here. Looked in:\n  ${CANDIDATES.join('\n  ')}`);
    t.skip('ores-contracts unavailable (run `zed install`)');
    return;
  }
  const { parseTypeSpec } = await import(join(src, 'parse-typespec.mjs'));
  const { parseJsonSchema } = await import(join(src, 'parse-json-schema.mjs'));
  const { compare, canonical } = await import(join(src, 'ir.mjs'));

  const tsp = parseTypeSpec(readFileSync(join(here, '..', 'contracts/typespec/main.tsp'), 'utf8'));
  const js = parseJsonSchema(JSON.parse(readFileSync(join(here, '..', 'contracts/json-schema/contract.schema.json'), 'utf8')));

  const differences = compare(tsp, js);
  assert.deepEqual(differences, [], `the authorities disagree:\n  ${differences.join('\n  ')}`);
  assert.equal(canonical(tsp), canonical(js));
  assert.equal(tsp.models.length, 4);
  assert.equal(Object.keys(tsp.enums).length, 5);
});
