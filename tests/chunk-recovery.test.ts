import { describe, expect, it } from "vitest";
import { canAttemptChunkReload, isChunkLoadFailure } from "@/lib/chunk-recovery";

describe("stale chunk recovery", () => {
  it("detects common Next.js dynamic chunk failures", () => {
    expect(isChunkLoadFailure(Object.assign(new Error("Loading chunk 123 failed"), { name: "ChunkLoadError" }))).toBe(true);
    expect(isChunkLoadFailure(new Error("Failed to fetch dynamically imported module"))).toBe(true);
    expect(isChunkLoadFailure(new Error("ordinary request failed"))).toBe(false);
  });

  it("permits only one automatic reload per tab session", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
    expect(canAttemptChunkReload(storage)).toBe(true);
    expect(canAttemptChunkReload(storage)).toBe(false);
  });
});
