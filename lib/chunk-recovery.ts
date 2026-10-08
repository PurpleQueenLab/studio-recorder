export const CHUNK_RELOAD_KEY = "studio-recorder:chunk-reload-attempted";

export function isChunkLoadFailure(reason: unknown): boolean {
  const error = reason && typeof reason === "object" && "reason" in reason ? (reason as { reason: unknown }).reason : reason;
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return name === "ChunkLoadError" || /Loading chunk [^ ]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(message);
}

export function canAttemptChunkReload(storage: Pick<Storage, "getItem" | "setItem">): boolean {
  try {
    if (storage.getItem(CHUNK_RELOAD_KEY)) return false;
    storage.setItem(CHUNK_RELOAD_KEY, new Date().toISOString());
    return true;
  } catch { return false; }
}
