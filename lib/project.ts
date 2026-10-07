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

export function cropAspect(aspect: "16:9" | "9:16" | "1:1" | "4:5", sourceAspect = 16 / 9): NormalizedRect {
  const [horizontal, vertical] = aspect.split(":").map(Number);
  const normalizedTarget = (horizontal / vertical) / sourceAspect;
  if (normalizedTarget <= 1) return { x: (1 - normalizedTarget) / 2, y: 0, width: normalizedTarget, height: 1 };
  const height = 1 / normalizedTarget;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
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

export function editedTimestamp(project: StudioProject, timestamp: number, trimStart = 0): number | null {
  const sourceTimestamp = timestamp + trimStart;
  const sorted = project.edits.filter((edit) => edit.type === "delete" && edit.end > edit.start).sort((a, b) => a.start - b.start);
  const deletions: Array<{ start: number; end: number }> = [];
  for (const edit of sorted) {
    const previous = deletions.at(-1);
    if (previous && edit.start <= previous.end) previous.end = Math.max(previous.end, edit.end);
    else deletions.push({ start: edit.start, end: edit.end });
  }
  let shift = 0;
  for (const deletion of deletions) {
    if (sourceTimestamp >= deletion.start && sourceTimestamp < deletion.end) return null;
    if (sourceTimestamp >= deletion.end) shift += Math.max(0, deletion.end - Math.max(deletion.start, trimStart));
  }
  return timestamp - shift;
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
    cursor: { style: "system", size: 1, opacity: 1, shadow: true, smoothing: 0.65, clickEffect: "pulse" },
    canvas: { aspectRatio: "16:9", background: "#7563ea", fit: "fit", scale: 0.9 },
    trim: { start: 0, end: null },
    edits: [],
  };
}

export function normalizeProject(project: StudioProject): StudioProject {
  return {
    ...project,
    crop: project.crop ?? FULL_FRAME,
    camera: project.camera ?? { visible: project.mode !== "screen", shape: "circle", rect: { x: .76, y: .68, width: .2, height: .27 } },
    zoomEvents: project.zoomEvents ?? [],
    cursor: project.cursor ?? { style: "system", size: 1, opacity: 1, shadow: true, smoothing: .65, clickEffect: "pulse" },
    canvas: project.canvas ?? { aspectRatio: "16:9", background: "#7563ea", fit: "fit", scale: .9 },
    trim: project.trim ?? { start: 0, end: null },
    edits: project.edits ?? [],
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
