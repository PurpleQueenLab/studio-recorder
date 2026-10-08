import { describe, expect, it } from "vitest";
import { clampRect, cropAspect, cropPreset, createProject, editedTimestamp, formatDefaultFilename, formatExportFallback, mergeNearbyZooms, normalizeProject, primaryVideoSourceKind, sanitizeFilename } from "@/lib/project";

describe("project utilities", () => {
  it("keeps crop coordinates inside normalized bounds", () => {
    expect(clampRect({ x: -.4, y: .9, width: .6, height: .5 })).toEqual({ x: 0, y: .5, width: .6, height: .5 });
  });

  it("creates useful crop presets", () => {
    expect(cropPreset("centre")).toEqual({ x: .15, y: .15, width: .7, height: .7 });
    expect(cropPreset("right").x).toBe(.3);
    expect(cropAspect("1:1")).toEqual({ x: .21875, y: 0, width: .5625, height: 1 });
  });

  it("suppresses nearby zooms while preserving the first trigger time", () => {
    const events = [
      { id: "a", time: 1, x: .2, y: .2, scale: 1.5, duration: 1.4 },
      { id: "b", time: 1.2, x: .25, y: .24, scale: 1.6, duration: 1.4 },
    ];
    const merged = mergeNearbyZooms(events);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "b", time: 1, x: .25, y: .24, scale: 1.6 });
    expect(merged[0].duration).toBeCloseTo(1.6);
  });

  it("generates readable, filesystem-safe names", () => {
    expect(formatDefaultFilename(new Date("2026-10-07T09:05:00Z"))).toContain("October 7, 2026");
    expect(formatExportFallback(new Date("2026-10-07T09:05:00Z"))).toMatch(/^October 7, 2026 at \d{1,2}-05 (AM|PM)$/);
    expect(sanitizeFilename('Demo: intro/part 1?')).toBe("Demo- intro-part 1-");
  });

  it("uses the camera recording as the primary video in camera-only projects", () => {
    expect(primaryVideoSourceKind("camera")).toBe("camera");
    expect(primaryVideoSourceKind("screen-camera")).toBe("screen");
    expect(primaryVideoSourceKind("screen")).toBe("screen");
  });

  it("normalizes older locally stored projects without losing their identity", () => {
    const project = createProject("screen", new Date("2026-10-07T10:00:00Z"));
    const legacy = { ...project, cursor: undefined, canvas: undefined, trim: undefined } as unknown as typeof project;
    const normalized = normalizeProject(legacy);
    expect(normalized.id).toBe(project.id);
    expect(normalized.cursor.style).toBe("system");
    expect(normalized.canvas.aspectRatio).toBe("16:9");
    expect(normalized.trim).toEqual({ start: 0, end: null });
  });

  it("retimes merged delete ranges relative to a trim without double shifting", () => {
    const project = createProject("screen", new Date("2026-10-07T10:00:00Z"));
    project.edits = [
      { type: "delete", start: 1, end: 3 },
      { type: "delete", start: 2.5, end: 4 },
      { type: "delete", start: 7, end: 8 },
    ];
    expect(editedTimestamp(project, 0.5, 2)).toBeNull();
    expect(editedTimestamp(project, 3, 2)).toBe(1);
    expect(editedTimestamp(project, 5.5, 2)).toBeNull();
    expect(editedTimestamp(project, 7, 2)).toBe(4);
  });
});
