// Structural readers used only to WITNESS that the three artifacts agree:
// the TypeSpec authority, the JSON Schema authority, and the projection of a manifest.
// Full contract checking is ORESoftware/ores-contracts' job; this runs offline, in every CI.

/** model name -> Set(field names), read from the TypeSpec authority. */
export function typespecModels(source) {
  const src = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const models = new Map();
  for (const m of src.matchAll(/\bmodel\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([^}]*)\}/g)) {
    const fields = new Set();
    for (const stmt of m[2].split(';')) {
      const f = stmt.trim().match(/([A-Za-z_][A-Za-z0-9_]*)\??\s*:\s*[A-Za-z_][A-Za-z0-9_.]*(\[\])?$/);
      if (f) fields.add(f[1]);
    }
    if (fields.size) models.set(m[1], fields);
  }
  return models;
}

/** model name -> Set(field names), read from the JSON Schema authority. */
export function jsonSchemaModels(doc) {
  const models = new Map();
  for (const [name, def] of Object.entries(doc.$defs ?? {})) {
    if (def.type === 'object') models.set(name, new Set(Object.keys(def.properties ?? {})));
  }
  return models;
}

/**
 * Every projected row must use only field names both authorities declare, and must carry
 * every non-optional one. Returns the list of disagreements (empty when the three agree).
 */
export function witnessProjection(rows, tsp, js, optional = new Set(['supersededAt', 'hostSelector'])) {
  const out = [];
  for (const [model, list] of Object.entries(rows)) {
    const a = tsp.get(model);
    const b = js.get(model);
    if (!a) {
      out.push(`model ${model}: absent from the TypeSpec authority`);
      continue;
    }
    if (!b) {
      out.push(`model ${model}: absent from the JSON Schema authority`);
      continue;
    }
    for (const fname of a) if (!b.has(fname)) out.push(`field ${model}.${fname}: in TypeSpec, not in JSON Schema`);
    for (const fname of b) if (!a.has(fname)) out.push(`field ${model}.${fname}: in JSON Schema, not in TypeSpec`);
    for (const row of list) {
      for (const k of Object.keys(row)) {
        if (!a.has(k)) out.push(`projected ${model}.${k} is not declared by the contract`);
      }
      for (const fname of a) {
        if (!optional.has(fname) && !(fname in row)) out.push(`projected ${model} row is missing declared field \`${fname}\``);
      }
    }
  }
  return out;
}
