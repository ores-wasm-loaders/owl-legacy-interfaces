// TypeSpec authority for the loader release registry.
//
// This is the relational projection of the on-the-wire release manifest
// (`contracts/manifest/manifest.schema.json`): the same vocabulary, stored so a
// product org can answer "which release is live, what does it contain, and what
// is a marketing page allowed to prepare" without parsing every manifest.
//
// It is an independent peer of contracts/json-schema/contract.schema.json.
// Neither is generated from the other; ores-contracts must find them equivalent.
import "./ores.tsp";
using Ores;

namespace Ores.WasmLoaders;

/** Which loader adapter owns a release's lifecycle. */
enum LoaderFramework {
  Flutter: "flutter",
  Leptos: "leptos",
  Dioxus: "dioxus",
  WasmBindgen: "wasm-bindgen",
}

/** The role a file plays in a release's startup. */
enum EntrypointRole {
  Bootstrap: "bootstrap",
  Glue: "glue",
  Module: "module",
  Fallback: "fallback",
  Chunk: "chunk",
}

/** How eagerly an asset may be prepared before the visitor asks for the app. */
enum AssetStage {
  Critical: "critical",
  Optional: "optional",
  Lazy: "lazy",
}

/** What activation does once preparation is complete. */
enum ActivationMode {
  /** Attach a view to an already-running engine (Flutter embedded multi-view). */
  AttachView: "attach-view",
  /** Hydrate server-rendered islands in place (Leptos islands). */
  HydrateIslands: "hydrate-islands",
  /** Mount a route-owned bundle (Dioxus route chunks). */
  MountRoute: "mount-route",
  /** Start the whole application into a host element. */
  RunApp: "run-app",
}

/** How far preparation is permitted to go. Compilation is optional, never assumed. */
enum PrepareStage {
  /** Fetch bytes into an eligible cache. Never executes anything. */
  Fetch: "fetch",
  /** Additionally compile to a WebAssembly.Module where the adapter can reuse it. */
  Compile: "compile",
}

@doc("One immutable published release of one application.")
@Ores.table("wasm_releases")
@Ores.unique("appId,releaseId")
@Ores.index("appId,publishedAt")
model WasmRelease {
  @key id: uuid;

  @doc("Stable application identifier, e.g. `gha-indie-worker-web`.")
  @maxLength(128)
  appId: string;

  @doc("Immutable release identifier — also the CDN path segment.")
  @maxLength(128)
  releaseId: string;

  framework: LoaderFramework;

  @doc("Toolchain that produced the build, e.g. `flutter 3.35.1` or `wasm-bindgen 0.2.95`.")
  @maxLength(128)
  toolchain: string;

  @doc("Version of this loader contract the manifest was written against.")
  @maxLength(32)
  contractVersion: string;

  @doc("Absolute or origin-relative base URL of the immutable release directory.")
  @maxLength(512)
  baseUrl: string;

  @doc("Flutter's threaded renderer needs cross-origin isolation — most releases do not.")
  requiresCrossOriginIsolation: boolean;

  publishedAt: utcDateTime;
  supersededAt?: utcDateTime;
}

@doc("A file a release needs at startup, in the role its build output gives it.")
@Ores.table("wasm_entrypoints")
@Ores.unique("releaseId,path")
model WasmEntrypoint {
  @key id: uuid;
  @Ores.references("WasmRelease.id") releaseId: uuid;

  role: EntrypointRole;

  @doc("Path relative to the release baseUrl.")
  @maxLength(512)
  path: string;

  @maxLength(128)
  contentType: string;

  bytes: int64;

  @doc("Lowercase hex SHA-256 of the file as served.")
  @maxLength(64)
  sha256: string;
}

@doc("Any other asset of the release, tagged with how eagerly it may be prepared.")
@Ores.table("wasm_assets")
@Ores.unique("releaseId,path")
@Ores.index("releaseId,stage")
model WasmAsset {
  @key id: uuid;
  @Ores.references("WasmRelease.id") releaseId: uuid;

  @maxLength(512)
  path: string;

  @maxLength(128)
  contentType: string;

  bytes: int64;

  @maxLength(64)
  sha256: string;

  stage: AssetStage;
}

@doc("The budget and lifecycle a marketing page must respect for this release.")
@Ores.table("wasm_prepare_policies")
@Ores.unique("releaseId")
model WasmPreparePolicy {
  @key id: uuid;
  @Ores.references("WasmRelease.id") releaseId: uuid;

  @doc("Hard ceiling on bytes preparation may fetch for this release.")
  maxPrepareBytes: int64;

  @doc("Maximum concurrent prepare requests for this release.")
  maxConcurrency: int32;

  @doc("Furthest stage preparation may reach.")
  furthestStage: PrepareStage;

  activation: ActivationMode;

  @doc("Element id or selector the app mounts into, when activation needs one.")
  @maxLength(256)
  hostSelector?: string;
}
