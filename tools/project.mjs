// Projection: one owl-manifest.json document -> the rows of the release registry
// declared by contracts/typespec/main.tsp and contracts/json-schema/contract.schema.json.
//
// Pure and deterministic: the same manifest always yields the same ids, so a registry
// can be rebuilt from the manifests without a database round-trip.
import { createHash } from 'node:crypto';

/** Deterministic RFC-4122-shaped id derived from the manifest identity (not random). */
export function derivedId(...parts) {
  const h = createHash('sha256').update(parts.join(' ')).digest('hex');
  const v = ((Number.parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function projectManifest(manifest, { publishedAt }) {
  const releaseUuid = derivedId(manifest.appId, manifest.releaseId);
  const release = {
    id: releaseUuid,
    appId: manifest.appId,
    releaseId: manifest.releaseId,
    framework: manifest.framework,
    toolchain: manifest.toolchain,
    contractVersion: manifest.contractVersion,
    baseUrl: manifest.baseUrl,
    requiresCrossOriginIsolation: manifest.requiresCrossOriginIsolation ?? false,
    publishedAt,
  };
  const entrypoints = manifest.entrypoints.map((e) => ({
    id: derivedId(releaseUuid, 'entrypoint', e.path),
    releaseId: releaseUuid,
    role: e.role,
    path: e.path,
    contentType: e.contentType,
    bytes: e.bytes,
    sha256: e.sha256,
  }));
  const assets = manifest.assets.map((a) => ({
    id: derivedId(releaseUuid, 'asset', a.path),
    releaseId: releaseUuid,
    path: a.path,
    contentType: a.contentType,
    bytes: a.bytes,
    sha256: a.sha256,
    stage: a.stage,
  }));
  const policies = [
    {
      id: derivedId(releaseUuid, 'policy'),
      releaseId: releaseUuid,
      maxPrepareBytes: manifest.prepare.maxBytes,
      maxConcurrency: manifest.prepare.maxConcurrency,
      furthestStage: manifest.prepare.furthestStage,
      activation: manifest.activation.mode,
      ...(manifest.activation.hostSelector ? { hostSelector: manifest.activation.hostSelector } : {}),
    },
  ];
  return { WasmRelease: [release], WasmEntrypoint: entrypoints, WasmAsset: assets, WasmPreparePolicy: policies };
}
