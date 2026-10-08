import type { PointerEventMetadata } from "@/types/project";

export const STUDIO_CAPTURE_HANDLE = "studio-recorder-local-capture-v1";

type PointerTarget = {
  addEventListener(type: "pointerdown", listener: (event: PointerEvent) => void, options?: AddEventListenerOptions): void;
  removeEventListener(type: "pointerdown", listener: (event: PointerEvent) => void, options?: EventListenerOptions): void;
};

type PointerCaptureOptions = {
  target: PointerTarget;
  now?: () => number;
  viewport?: () => { width: number; height: number };
  createId?: () => string;
  onCapture: (event: PointerEventMetadata) => void;
};

export class PointerCaptureSession {
  private active = false;
  private paused = false;
  private startedAt?: number;
  private pausedAt = 0;
  private totalPaused = 0;
  private stoppedAt = 0;
  private readonly now: () => number;
  private readonly viewport: () => { width: number; height: number };
  private readonly createId: () => string;
  private readonly listener = (event: PointerEvent) => this.capture(event);

  constructor(private readonly options: PointerCaptureOptions) {
    this.now = options.now ?? (() => performance.now());
    this.viewport = options.viewport ?? (() => ({ width: window.innerWidth, height: window.innerHeight }));
    this.createId = options.createId ?? (() => crypto.randomUUID());
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.paused = false;
    this.startedAt = this.now();
    this.pausedAt = 0;
    this.totalPaused = 0;
    this.stoppedAt = 0;
    this.options.target.addEventListener("pointerdown", this.listener, { capture: true });
  }

  pause(): void {
    if (!this.active || this.paused) return;
    this.paused = true;
    this.pausedAt = this.now();
  }

  resume(): void {
    if (!this.active || !this.paused) return;
    this.totalPaused += Math.max(0, this.now() - this.pausedAt);
    this.paused = false;
    this.pausedAt = 0;
  }

  stop(): number {
    if (!this.active) return this.elapsedSeconds();
    this.stoppedAt = this.now();
    if (this.paused) this.totalPaused += Math.max(0, this.stoppedAt - this.pausedAt);
    this.active = false;
    this.paused = false;
    this.options.target.removeEventListener("pointerdown", this.listener, { capture: true });
    return this.elapsedSeconds();
  }

  elapsedSeconds(): number {
    if (this.startedAt === undefined) return 0;
    const end = this.stoppedAt || (this.paused ? this.pausedAt : this.now());
    return Math.max(0, (end - this.startedAt - this.totalPaused) / 1000);
  }

  private capture(event: PointerEvent): void {
    if (!this.active || this.paused) return;
    const viewport = this.viewport();
    const observedWidth = Math.max(1, viewport.width);
    const observedHeight = Math.max(1, viewport.height);
    const x = clamp(event.clientX / observedWidth);
    const y = clamp(event.clientY / observedHeight);
    this.options.onCapture({
      id: this.createId(),
      time: this.elapsedSeconds(),
      clientX: event.clientX,
      clientY: event.clientY,
      observedWidth,
      observedHeight,
      x,
      y,
      clickType: event.button === 2 ? "secondary" : "primary",
      scope: "studio-ui",
    });
  }
}

export function configureStudioCaptureHandle(): void {
  const devices = navigator.mediaDevices as MediaDevices & {
    setCaptureHandleConfig?: (config: { exposeOrigin: boolean; handle: string; permittedOrigins: string[] }) => void;
  };
  try {
    devices.setCaptureHandleConfig?.({ exposeOrigin: true, handle: STUDIO_CAPTURE_HANDLE, permittedOrigins: [location.origin] });
  } catch {
    // Unsupported browsers continue with manual zoom; capture remains local.
  }
}

export function isStudioTabCapture(track?: MediaStreamTrack, expectedOrigin = location.origin, currentTitle = document.title): boolean {
  if (!track) return false;
  const captureTrack = track as MediaStreamTrack & { getCaptureHandle?: () => { handle?: string; origin?: string } | null };
  const captureHandle = captureTrack.getCaptureHandle?.();
  if (captureHandle?.handle === STUDIO_CAPTURE_HANDLE && (!captureHandle.origin || captureHandle.origin === expectedOrigin)) return true;
  // Browsers intentionally hide the selected tab URL when Capture Handle is unavailable.
  // A browser-surface track is the strongest remaining signal and enables the observable
  // same-page pointer path; window and monitor captures remain manual-only.
  if (track.getSettings?.().displaySurface === "browser") return true;
  const label = track.label.toLocaleLowerCase();
  return label.includes("studio recorder") || label.includes(currentTitle.toLocaleLowerCase());
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
