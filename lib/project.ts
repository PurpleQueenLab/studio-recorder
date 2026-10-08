import type { AudioProjectState, AudioTrackType, NormalizedRect, PointerEventMetadata, RecordingMode, StudioProject, ZoomEvent } from "@/types/project";
import { DEFAULT_CAPTURE_QUALITY } from "@/lib/media/quality";

export const FULL_FRAME: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };

export function primaryVideoSourceKind(mode: RecordingMode): "screen" | "camera" {
  return mode === "camera" ? "camera" : "screen";
}

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
      const distance = previous ? Math.hypot(event.x - previous.x, event.y - previous.y) : Number.POSITIVE_INFINITY;
      if (previous && event.time - previous.time < threshold && distance < .18) {
        merged[merged.length - 1] = { ...event, time: previous.time, duration: Math.max(previous.duration, event.duration + event.time - previous.time) };
      } else merged.push(event);
      return merged;
    }, []);
}

export function createDefaultAudioState(): AudioProjectState {
  const track = (type: AudioTrackType) => ({ type, muted: false, solo: false, volume: type === "music" ? .45 : 1, fadeIn: 0, fadeOut: 0 });
  return {
    tracks: {
      microphone: track("microphone"),
      "computer-audio": track("computer-audio"),
      voiceover: track("voiceover"),
      music: track("music"),
    },
    clips: [],
    waveforms: {},
    ducking: { enabled: false, amount: "medium" },
  };
}

export function deriveZoomEvents(clicks: PointerEventMetadata[], threshold = .45): ZoomEvent[] {
  return mergeNearbyZooms(clicks.map((click) => ({
    id: click.id,
    time: Math.max(0, click.time - .15),
    x: clamp(click.x, 0, 1),
    y: clamp(click.y, 0, 1),
    scale: 1.5,
    duration: 1.4,
    enabled: true,
    source: "automatic" as const,
  })), threshold);
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
    quality: { ...DEFAULT_CAPTURE_QUALITY },
    sources: [],
    crop: FULL_FRAME,
    camera: { visible: mode !== "screen", shape: "circle", rect: { x: 0.76, y: 0.62, width: 0.2, height: 0.356 } },
    zoomEvents: [],
    pointerEvents: [],
    cursor: { style: "system", size: 1, opacity: 1, shadow: true, smoothing: 0.65, clickEffect: "pulse" },
    canvas: { aspectRatio: "16:9", background: "#7563ea", fit: "fit", scale: 0.9 },
    background: { type: "gradient", value: "linear-gradient(135deg, #7563ea 0%, #32256f 100%)", fit: "fill", blur: 24, brightness: .7 },
    presentation: { scale: .88, x: .5, y: .5, padding: .06, cornerRadius: 18, shadow: .7, frame: "floating" },
    audio: createDefaultAudioState(),
    assets: [],
    trim: { start: 0, end: null },
    edits: [],
  };
}

export function normalizeProject(project: StudioProject): StudioProject {
  const audioDefaults = createDefaultAudioState();
  return {
    ...project,
    quality: project.quality ?? { ...DEFAULT_CAPTURE_QUALITY },
    crop: project.crop ?? FULL_FRAME,
    camera: project.camera ?? { visible: project.mode !== "screen", shape: "circle", rect: { x: .76, y: .62, width: .2, height: .356 } },
    zoomEvents: (project.zoomEvents ?? []).map((event) => ({ enabled: true, source: "manual", ...event })),
    pointerEvents: (project.pointerEvents ?? []).map((event) => ({
      ...event,
      clientX: event.clientX ?? event.x,
      clientY: event.clientY ?? event.y,
      observedWidth: event.observedWidth ?? 1,
      observedHeight: event.observedHeight ?? 1,
    })),
    cursor: project.cursor ?? { style: "system", size: 1, opacity: 1, shadow: true, smoothing: .65, clickEffect: "pulse" },
    canvas: project.canvas ?? { aspectRatio: "16:9", background: "#7563ea", fit: "fit", scale: .9 },
    background: project.background ?? { type: "color", value: project.canvas?.background ?? "#7563ea", fit: "fill", blur: 24, brightness: .7 },
    presentation: project.presentation ?? { scale: project.canvas?.scale ?? .9, x: .5, y: .5, padding: .06, cornerRadius: 18, shadow: .7, frame: "floating" },
    audio: {
      ...audioDefaults,
      ...(project.audio ?? {}),
      tracks: { ...audioDefaults.tracks, ...(project.audio?.tracks ?? {}) },
      clips: project.audio?.clips ?? [],
      waveforms: project.audio?.waveforms ?? {},
      ducking: project.audio?.ducking ?? audioDefaults.ducking,
    },
    assets: project.assets ?? [],
    trim: project.trim ?? { start: 0, end: null },
    edits: project.edits ?? [],
  };
}

export function formatDefaultFilename(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date).replace(", at", " at");
}

export function formatExportFallback(date = new Date()): string {
  const datePart = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date);
  const timePart = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(date).replace(":", "-");
  return `${datePart} at ${timePart}`;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, " ").trim().slice(0, 160) || "Untitled recording";
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
