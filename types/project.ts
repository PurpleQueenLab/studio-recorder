export type RecordingMode = "screen" | "screen-camera" | "camera";
export type CameraShape = "circle" | "rounded" | "square";

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
  kind: "screen" | "camera" | "microphone" | "computer-audio";
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
  edits: Array<{ type: "trim" | "split" | "delete"; start: number; end: number }>;
}
