import { describe, expect, it, vi } from "vitest";
import { createExportDestination, type SaveWindow } from "@/features/export/mp4-export-engine";

describe("export save destination", () => {
  it("uses browser download fallback when the picker is unavailable", async () => {
    const destination = await createExportDestination({} as SaveWindow, "recording.mp4");
    expect(destination.saveFallbackUsed).toBe(true);
    expect(destination.bufferTarget).toBeDefined();
  });

  it("uses browser download fallback when the picker is denied", async () => {
    const destination = await createExportDestination({ showSaveFilePicker: vi.fn().mockRejectedValue(new DOMException("Denied", "AbortError")) }, "recording.mp4");
    expect(destination.saveFallbackUsed).toBe(true);
    expect(destination.fileHandle).toBeUndefined();
  });

  it("uses browser download fallback when opening the writable file fails", async () => {
    const handle = { createWritable: vi.fn().mockRejectedValue(new Error("unavailable")) } as unknown as FileSystemFileHandle;
    const destination = await createExportDestination({ showSaveFilePicker: vi.fn().mockResolvedValue(handle) }, "recording.mp4");
    expect(destination.saveFallbackUsed).toBe(true);
  });
});
