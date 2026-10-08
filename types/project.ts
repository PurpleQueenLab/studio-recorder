export type RecordingMode = "screen" | "screen-camera" | "camera";
export type CameraShape = "circle" | "rounded" | "square";
export type CursorStyle = "system" | "arrow" | "dot" | "large-dot" | "circle" | "hidden";
export type AudioTrackType = "microphone" | "computer-audio" | "voiceover" | "music";
export type BackgroundType = "color" | "gradient" | "wallpaper" | "image" | "blurred-source";
export type PresentationFrame = "none" | "browser" | "macos" | "floating";
export type CaptureResolution = "1080p" | "1440p" | "2160p";
export type CaptureFrameRate = 30 | 60;
export type CaptureQualityLevel = "optimized" | "high" | "maximum";

export interface CaptureQuality {
  resolution: CaptureResolution;
  frameRate: CaptureFrameRate;
  level: CaptureQualityLevel;
  width: number;
  height: number;
}

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
  enabled?: boolean;
  source?: "manual" | "automatic";
}

export interface PointerEventMetadata {
  id: string;
  time: number;
  clientX: number;
  clientY: number;
  observedWidth: number;
  observedHeight: number;
  x: number;
  y: number;
  clickType: "primary" | "secondary";
  scope: "studio-ui";
}

export interface ProjectSource {
  kind: "screen" | "camera" | "microphone" | "computer-audio" | "export-audio";
  chunkCount: number;
  mimeType: string;
  width?: number;
  height?: number;
  frameRate?: number;
}

export interface ProjectAsset {
  id: string;
  kind: "voiceover" | "music" | "background-image" | "video" | "thumbnail";
  name: string;
  mimeType: string;
  chunkCount: number;
  duration?: number;
}

export interface VideoClip {
  id: string;
  sourceId: string;
  name: string;
  timelineStart: number;
  sourceIn: number;
  sourceOut: number;
}

export interface AudioTrackSettings {
  type: AudioTrackType;
  muted: boolean;
  solo: boolean;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface AudioClip {
  id: string;
  sourceId: string;
  trackType: AudioTrackType;
  startTime: number;
  sourceIn: number;
  sourceOut: number;
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  waveform?: number[];
}

export interface AudioProjectState {
  tracks: Record<AudioTrackType, AudioTrackSettings>;
  clips: AudioClip[];
  waveforms: Partial<Record<AudioTrackType, number[]>>;
  ducking: { enabled: boolean; amount: "light" | "medium" | "strong" };
}

export interface AudioToolsProject {
  id: "current";
  name: string;
  exportName: string;
  mimeType: string;
  blob: Blob;
  duration: number;
  waveform: number[];
  trimStart: number;
  trimEnd: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  updatedAt: string;
}

export interface BackgroundSettings {
  type: BackgroundType;
  value: string;
  assetId?: string;
  fit: "fit" | "fill";
  blur: number;
  brightness: number;
}

export interface PresentationSettings {
  scale: number;
  x: number;
  y: number;
  padding: number;
  cornerRadius: number;
  shadow: number;
  frame: PresentationFrame;
}

export interface StudioProject {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  duration: number;
  mode: RecordingMode;
  quality: CaptureQuality;
  sources: ProjectSource[];
  crop: NormalizedRect;
  camera: { visible: boolean; shape: CameraShape; rect: NormalizedRect };
  zoomEvents: ZoomEvent[];
  pointerEvents: PointerEventMetadata[];
  cursor: { style: CursorStyle; size: number; opacity: number; shadow: boolean; smoothing: number; clickEffect: "none" | "pulse" | "ripple" | "scale" };
  canvas: { aspectRatio: "16:9" | "9:16" | "1:1" | "4:5" | "original"; background: string; fit: "fit" | "fill"; scale: number };
  background: BackgroundSettings;
  presentation: PresentationSettings;
  audio: AudioProjectState;
  assets: ProjectAsset[];
  videoClips: VideoClip[];
  thumbnailAssetId?: string;
  trim: { start: number; end: number | null };
  edits: Array<{ type: "trim" | "split" | "delete"; start: number; end: number }>;
}
