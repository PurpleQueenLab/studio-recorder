export type RecordingMode = "screen" | "screen-camera" | "camera";
export type CameraShape = "circle" | "rounded" | "square";
export type CursorStyle = "system" | "arrow" | "dot" | "large-dot" | "circle" | "hidden";

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ZoomEvent {
  id: string;
  time: number;
  x: number;
  y: number;
  scale: number;
  duration: number;
}

export interface ProjectSource {
  kind: "screen" | "camera" | "microphone" | "computer-audio" | "export-audio";
  chunkCount: number;
  mimeType: string;
}

export interface StudioProject {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  duration: number;
  mode: RecordingMode;
  sources: ProjectSource[];
  crop: NormalizedRect;
  camera: { visible: boolean; shape: CameraShape; rect: NormalizedRect };
  zoomEvents: ZoomEvent[];
  cursor: { style: CursorStyle; size: number; opacity: number; shadow: boolean; smoothing: number; clickEffect: "none" | "pulse" | "ripple" | "scale" };
  canvas: { aspectRatio: "16:9" | "9:16" | "1:1" | "4:5" | "original"; background: string; fit: "fit" | "fill"; scale: number };
  trim: { start: number; end: number | null };
  edits: Array<{ type: "trim" | "split" | "delete"; start: number; end: number }>;
}
