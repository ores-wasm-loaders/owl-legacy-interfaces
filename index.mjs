// owl-interfaces — the loader fleet's shared vocabulary.
//
// The authorities are the files under contracts/; this module is only the accessor the
// other repos import through zed-pkg, so nobody re-reads schema paths by hand.
import { readFileSync } from 'node:fs';

export { validateManifest, checkManifest, assertManifest, ManifestError } from './tools/validate-manifest.mjs';
export { projectManifest, derivedId } from './tools/project.mjs';
export { typespecModels, jsonSchemaModels, witnessProjection } from './tools/witness.mjs';

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));

/** The manifest artifact schema (`owl-manifest.json`). */
export const manifestSchema = read('./contracts/manifest/manifest.schema.json');

/** The JSON Schema authority for the release registry. */
export const registrySchema = read('./contracts/json-schema/contract.schema.json');

/** The contract version this package speaks. Loaders refuse manifests written for another. */
export const CONTRACT_VERSION = '1.0.0';

/** Lifecycle vocabulary, frozen, so adapters and the coordinator cannot drift apart. */
export const PREPARE_STAGES = Object.freeze(['fetch', 'compile']);
export const ACTIVATION_MODES = Object.freeze(['attach-view', 'hydrate-islands', 'mount-route', 'run-app']);
export const FRAMEWORKS = Object.freeze(['flutter', 'leptos', 'dioxus', 'wasm-bindgen']);
export const ASSET_STAGES = Object.freeze(['critical', 'optional', 'lazy']);
export const ENTRYPOINT_ROLES = Object.freeze(['bootstrap', 'glue', 'module', 'fallback', 'chunk']);

/** Absolute URL of a release-relative path. Refuses to leave the release directory. */
export function releaseUrl(manifest, path) {
  if (path.startsWith('/') || path.includes('..')) {
    throw new Error(`path \`${path}\` must be relative to the release baseUrl and must not traverse`);
  }
  return `${manifest.baseUrl}${path}`;
}

/** The entrypoints and assets preparation is allowed to touch, in priority order. */
export function preparableAssets(manifest) {
  const critical = manifest.assets.filter((a) => a.stage === 'critical');
  const optional = manifest.assets.filter((a) => a.stage === 'optional');
  return [...manifest.entrypoints, ...critical, ...optional].map((e) => ({
    path: e.path,
    contentType: e.contentType,
    bytes: e.bytes,
    sha256: e.sha256,
    role: e.role ?? null,
    stage: e.stage ?? 'critical',
  }));
}
