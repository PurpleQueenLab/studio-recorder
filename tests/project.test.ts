import { describe, expect, it } from "vitest";
import { clampRect, cropPreset, formatDefaultFilename, mergeNearbyZooms, sanitizeFilename } from "@/lib/project";

describe("project utilities", () => {
  it("keeps crop coordinates inside normalized bounds", () => {
    expect(clampRect({ x: -.4, y: .9, width: .6, height: .5 })).toEqual({ x: 0, y: .5, width: .6, height: .5 });
  });

  it("creates useful crop presets", () => {
    expect(cropPreset("centre")).toEqual({ x: .15, y: .15, width: .7, height: .7 });
    expect(cropPreset("right").x).toBe(.3);
  });

  it("suppresses nearby zooms while preserving the first trigger time", () => {
    const events = [
      { id: "a", time: 1, x: .2, y: .2, scale: 1.5, duration: 1.4 },
      { id: "b", time: 1.2, x: .8, y: .7, scale: 1.6, duration: 1.4 },
    ];
    expect(mergeNearbyZooms(events)).toEqual([{ ...events[1], time: 1 }]);
  });

  it("generates readable, filesystem-safe names", () => {
    expect(formatDefaultFilename(new Date("2026-10-07T09:05:00Z"))).toContain("October 7, 2026");
    expect(sanitizeFilename('Demo: intro/part 1?')).toBe("Demo- intro-part 1-");
  });
});
