import type { NormalizedRect, RecordingMode, StudioProject, ZoomEvent } from "@/types/project";

export const FULL_FRAME: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };

export function clampRect(rect: NormalizedRect): NormalizedRect {
  const width = Math.min(1, Math.max(0.05, rect.width));
  const height = Math.min(1, Math.max(0.05, rect.height));
  return {
    x: Math.min(1 - width, Math.max(0, rect.x)),
    y: Math.min(1 - height, Math.max(0, rect.y)),
    width,
    height,
  };
}

export function cropPreset(position: "top" | "bottom" | "left" | "right" | "centre"): NormalizedRect {
  const presets: Record<typeof position, NormalizedRect> = {
    top: { x: 0, y: 0, width: 1, height: 0.7 },
    bottom: { x: 0, y: 0.3, width: 1, height: 0.7 },
    left: { x: 0, y: 0, width: 0.7, height: 1 },
    right: { x: 0.3, y: 0, width: 0.7, height: 1 },
    centre: { x: 0.15, y: 0.15, width: 0.7, height: 0.7 },
  };
  return presets[position];
}

export function mergeNearbyZooms(events: ZoomEvent[], threshold = 0.45): ZoomEvent[] {
  return [...events]
    .sort((a, b) => a.time - b.time)
    .reduce<ZoomEvent[]>((merged, event) => {
      const previous = merged.at(-1);
      if (previous && event.time - previous.time < threshold) {
        merged[merged.length - 1] = { ...event, time: previous.time };
      } else merged.push(event);
      return merged;
    }, []);
}

export function createProject(mode: RecordingMode, now = new Date()): StudioProject {
  const stamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    title: formatDefaultFilename(now),
    createdAt: stamp,
    updatedAt: stamp,
    duration: 0,
    mode,
    sources: [],
    crop: FULL_FRAME,
    camera: { visible: mode !== "screen", shape: "circle", rect: { x: 0.76, y: 0.68, width: 0.2, height: 0.27 } },
    zoomEvents: [],
    edits: [],
  };
}

export function formatDefaultFilename(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date).replace(", at", " at");
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, " ").trim().slice(0, 160) || "Untitled recording";
}
