// Dependency-free validator for the JSON Schema subset owl-manifest.json uses.
//
// It is deliberately NOT a general JSON Schema implementation: it supports exactly the
// keywords contracts/manifest/manifest.schema.json uses and throws on any keyword it does
// not know, so the schema can never quietly mean less than it says.
//
// Every error is a path + reason; nothing is coerced and nothing is defaulted in place.

const KNOWN = new Set([
  '$schema', '$id', 'title', 'description', 'default',
  'type', 'const', 'enum', 'properties', 'additionalProperties', 'required',
  'items', 'minItems', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum',
]);

export class ManifestError extends Error {
  constructor(errors) {
    super(`manifest is invalid:\n  ${errors.join('\n  ')}`);
    this.name = 'ManifestError';
    this.errors = errors;
  }
}

const typeOf = (v) =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;

function check(value, schema, path, out) {
  for (const k of Object.keys(schema)) {
    if (!KNOWN.has(k)) out.push(`${path || '$'}: schema uses unsupported keyword \`${k}\``);
  }
  if (schema.type !== undefined) {
    const actual = typeOf(value);
    const ok = schema.type === 'number' ? actual === 'integer' || actual === 'number' : actual === schema.type;
    if (!ok) {
      out.push(`${path || '$'}: expected ${schema.type}, got ${actual}`);
      return out;
    }
  }
  if (schema.const !== undefined && value !== schema.const) out.push(`${path}: expected ${JSON.stringify(schema.const)}`);
  if (schema.enum !== undefined && !schema.enum.includes(value)) out.push(`${path}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) out.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) out.push(`${path}: longer than ${schema.maxLength}`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) out.push(`${path}: does not match /${schema.pattern}/`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) out.push(`${path}: below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) out.push(`${path}: above maximum ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) out.push(`${path}: needs at least ${schema.minItems} item(s)`);
    if (schema.items) value.forEach((v, i) => check(v, schema.items, `${path}[${i}]`, out));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const r of schema.required ?? []) if (!(r in value)) out.push(`${path || '$'}: missing required property \`${r}\``);
    const props = schema.properties ?? {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) check(v, props[k], `${path}.${k}`, out);
      else if (schema.additionalProperties === false) out.push(`${path || '$'}: unexpected property \`${k}\``);
    }
  }
  return out;
}

/** Structural validation against the schema. Returns the list of errors (empty when valid). */
export function validateManifest(manifest, schema) {
  return check(manifest, schema, '', []);
}

/**
 * Validation plus the invariants a schema cannot express:
 * unique paths, a single release, budget coherence, and per-framework entrypoint roles.
 */
export function checkManifest(manifest, schema) {
  const errors = validateManifest(manifest, schema);
  if (errors.length) return errors;

  const seen = new Set();
  for (const e of [...manifest.entrypoints, ...manifest.assets]) {
    if (seen.has(e.path)) errors.push(`duplicate path \`${e.path}\``);
    seen.add(e.path);
    if (e.path.startsWith('/') || e.path.includes('..')) errors.push(`path \`${e.path}\` must be relative to baseUrl and must not traverse`);
    if (!e.path.startsWith(manifest.releaseId) && !manifest.baseUrl.includes(manifest.releaseId)) {
      errors.push(`neither baseUrl nor \`${e.path}\` carries releaseId \`${manifest.releaseId}\`: releases must be addressable immutably`);
    }
  }

  const critical = [
    ...manifest.entrypoints.map((e) => e.bytes),
    ...manifest.assets.filter((a) => a.stage === 'critical').map((a) => a.bytes),
  ].reduce((a, b) => a + b, 0);
  if (critical > manifest.prepare.maxBytes) {
    errors.push(`prepare.maxBytes ${manifest.prepare.maxBytes} cannot cover the ${critical} critical bytes: preparation would always be truncated`);
  }

  const roles = new Set(manifest.entrypoints.map((e) => e.role));
  const need = {
    flutter: ['bootstrap', 'module'],
    leptos: ['glue', 'module'],
    dioxus: ['glue', 'module'],
    'wasm-bindgen': ['glue', 'module'],
  }[manifest.framework];
  for (const r of need) if (!roles.has(r)) errors.push(`framework ${manifest.framework} needs an entrypoint with role \`${r}\``);

  const modes = {
    flutter: ['attach-view', 'run-app'],
    leptos: ['hydrate-islands', 'run-app'],
    dioxus: ['mount-route', 'run-app'],
    'wasm-bindgen': ['run-app'],
  }[manifest.framework];
  if (!modes.includes(manifest.activation.mode)) {
    errors.push(`framework ${manifest.framework} cannot activate as \`${manifest.activation.mode}\` (expected one of ${modes.join(', ')})`);
  }
  if (manifest.activation.mode === 'hydrate-islands' && !(manifest.activation.islands ?? []).length) {
    errors.push('hydrate-islands activation must name the islands it hydrates');
  }
  if (manifest.framework === 'flutter' && manifest.prepare.furthestStage === 'compile') {
    errors.push("flutter releases prepare fetch-only: the supported bootstrap owns compilation, so a separately compiled module cannot be handed to it");
  }
  return errors;
}

/** Throwing wrapper for call sites that treat an invalid manifest as fatal (CI, loaders). */
export function assertManifest(manifest, schema) {
  const errors = checkManifest(manifest, schema);
  if (errors.length) throw new ManifestError(errors);
  return manifest;
}
