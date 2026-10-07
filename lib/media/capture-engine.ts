import { LocalProjectStore } from "@/lib/storage/project-store";
import { createProject, deriveZoomEvents } from "@/lib/project";
import { isStudioTabCapture, PointerCaptureSession } from "@/lib/media/pointer-capture";
import type { RecordingMode, StudioProject } from "@/types/project";

export type CaptureAudioStatus = {
  microphone: { available: boolean; enabled: boolean; readyState: MediaStreamTrackState | "missing"; label: string };
  computerAudio: { available: boolean; enabled: boolean; readyState: MediaStreamTrackState | "missing"; label: string };
  pointerMetadata: boolean;
};

type CaptureCallbacks = {
  onState: (state: "requesting" | "ready" | "recording" | "paused" | "stopped") => void;
  onError: (message: string) => void;
  onAudioStatus?: (status: CaptureAudioStatus) => void;
  onPointerDiagnostic?: (event: { count: number; time: number; x: number; y: number }) => void;
};

export class CaptureEngine {
  private screen?: MediaStream;
  private camera?: MediaStream;
  private microphone?: MediaStream;
  private exportAudio?: MediaStream;
  private audioContext?: AudioContext;
  private recorders: MediaRecorder[] = [];
  private pendingWrites: Promise<void>[] = [];
  private project?: StudioProject;
  private pointerCapture?: PointerCaptureSession;
  private pointerMetadataAvailable = false;

  constructor(private store: LocalProjectStore, private callbacks: CaptureCallbacks) {}

  get streams() {
    return { screen: this.screen, camera: this.camera, microphone: this.microphone };
  }

  async prepareCameraPreview(cameraDeviceId?: string): Promise<MediaStream> {
    const currentTrack = this.camera?.getVideoTracks()[0];
    const requestedDevice = cameraDeviceId || undefined;
    if (currentTrack?.readyState === "live" && (!requestedDevice || currentTrack.getSettings().deviceId === requestedDevice)) return this.camera!;
    this.releaseCameraPreview();
    this.camera = await navigator.mediaDevices.getUserMedia({
      video: requestedDevice ? { deviceId: { exact: requestedDevice } } : true,
      audio: false,
    });
    const track = this.camera.getVideoTracks()[0];
    if (!track || track.readyState !== "live") throw new Error("The selected camera did not provide a live video track.");
    return this.camera;
  }

  releaseCameraPreview(): void {
    this.camera?.getTracks().forEach((track) => track.stop());
    this.camera = undefined;
  }

  async prepare(mode: RecordingMode, microphone = true, microphoneDeviceId?: string, cameraDeviceId?: string): Promise<void> {
    this.resetCapture(mode !== "screen");
    this.callbacks.onState("requesting");
    try {
      if (mode !== "camera") {
        this.screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        this.screen.getVideoTracks()[0]?.addEventListener("ended", () => { if (this.recorders.length) void this.stop(); else this.dispose(); });
      }
      if (mode !== "screen") await this.prepareCameraPreview(cameraDeviceId);
      if (microphone) this.microphone = await navigator.mediaDevices.getUserMedia({ audio: microphoneDeviceId ? { deviceId: { exact: microphoneDeviceId } } : true, video: false });
      const microphoneTrack = this.microphone?.getAudioTracks()[0];
      if (microphone && (!microphoneTrack || microphoneTrack.readyState !== "live" || !microphoneTrack.enabled)) throw new Error("The selected microphone did not provide a live audio track.");
      await this.createExportAudioMix();
      this.project = createProject(mode);
      const screenTrack = this.screen?.getVideoTracks()[0];
      this.pointerMetadataAvailable = isStudioTabCapture(screenTrack);
      this.emitAudioStatus();
      this.callbacks.onState("ready");
    } catch (error) {
      this.resetCapture(mode !== "screen");
      const name = error instanceof DOMException ? error.name : "CaptureError";
      this.callbacks.onError(name === "NotAllowedError" ? "Permission was not granted. You can retry and choose a different source." : error instanceof Error ? error.message : "The selected source could not be opened.");
      throw error;
    }
  }

  async start(): Promise<void> {
    if (!this.project) throw new Error("Prepare the recording before starting.");
    await this.store.putProject(this.project);
    this.recorders = [];
    this.pendingWrites = [];
    await this.audioContext?.resume();
    const sources: Array<[StudioProject["sources"][number]["kind"], MediaStream | undefined]> = [
      ["screen", this.screen && new MediaStream(this.screen.getVideoTracks())],
      ["computer-audio", this.screen?.getAudioTracks().length ? new MediaStream(this.screen.getAudioTracks()) : undefined],
      ["camera", this.camera],
      ["microphone", this.microphone],
      ["export-audio", this.exportAudio],
    ];
    for (const [source, stream] of sources) {
      if (!stream) continue;
      const mimeTypes = stream.getVideoTracks().length
        ? ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
        : ["audio/webm;codecs=opus", "audio/webm"];
      const mimeType = mimeTypes
        .find((value) => MediaRecorder.isTypeSupported(value));
      const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};
      if (stream.getVideoTracks().length) recorderOptions.videoBitsPerSecond = 8_000_000;
      else recorderOptions.audioBitsPerSecond = 192_000;
      const recorder = new MediaRecorder(stream, recorderOptions);
      let index = 0;
      const descriptor = { kind: source, chunkCount: 0, mimeType: recorder.mimeType };
      recorder.ondataavailable = (event) => {
        if (event.data.size) {
          this.pendingWrites.push(this.store.putChunk(this.project!.id, source, index++, event.data));
          descriptor.chunkCount = index;
        }
      };
      recorder.start(2_000);
      this.recorders.push(recorder);
      this.project.sources.push(descriptor);
    }
    this.startPointerCapture();
    this.callbacks.onState("recording");
  }

  pause(): void {
    this.recorders.forEach((recorder) => recorder.state === "recording" && recorder.pause());
    this.pointerCapture?.pause();
    this.callbacks.onState("paused");
  }

  resume(): void {
    this.recorders.forEach((recorder) => recorder.state === "paused" && recorder.resume());
    this.pointerCapture?.resume();
    this.callbacks.onState("recording");
  }

  async stop(): Promise<StudioProject | undefined> {
    const recordedDuration = this.stopPointerCapture();
    await Promise.all(this.recorders.map((recorder) => new Promise<void>((resolve) => {
      if (recorder.state === "inactive") return resolve();
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.stop();
    })));
    await Promise.all(this.pendingWrites);
    const completedProject = this.project;
    if (completedProject) {
      completedProject.duration = recordedDuration;
      completedProject.zoomEvents = deriveZoomEvents(completedProject.pointerEvents);
      completedProject.updatedAt = new Date().toISOString();
      await this.store.putProject(completedProject);
    }
    this.dispose();
    this.callbacks.onState("stopped");
    return completedProject;
  }

  dispose(): void {
    this.resetCapture(false);
  }

  private resetCapture(preserveCamera: boolean): void {
    this.stopPointerCapture();
    [this.screen, this.microphone, this.exportAudio].forEach((stream) => stream?.getTracks().forEach((track) => track.stop()));
    if (!preserveCamera) this.releaseCameraPreview();
    void this.audioContext?.close();
    this.screen = this.microphone = this.exportAudio = undefined;
    this.audioContext = undefined;
    this.recorders = [];
    this.project = undefined;
    this.callbacks.onAudioStatus?.({
      microphone: { available: false, enabled: false, readyState: "missing", label: "" },
      computerAudio: { available: false, enabled: false, readyState: "missing", label: "" },
      pointerMetadata: false,
    });
  }

  private async createExportAudioMix(): Promise<void> {
    const tracks = [...(this.screen?.getAudioTracks() ?? []), ...(this.microphone?.getAudioTracks() ?? [])];
    if (!tracks.length) return;
    this.audioContext = new AudioContext({ sampleRate: 48_000 });
    const destination = this.audioContext.createMediaStreamDestination();
    tracks.forEach((track) => {
      const source = this.audioContext!.createMediaStreamSource(new MediaStream([track]));
      const gain = this.audioContext!.createGain();
      gain.gain.value = tracks.length > 1 ? .72 : .9;
      source.connect(gain).connect(destination);
    });
    this.exportAudio = destination.stream;
    await this.audioContext.resume();
  }

  private emitAudioStatus(): void {
    const microphone = this.microphone?.getAudioTracks()[0];
    const computerAudio = this.screen?.getAudioTracks()[0];
    this.callbacks.onAudioStatus?.({
      microphone: { available: Boolean(microphone), enabled: Boolean(microphone?.enabled), readyState: microphone?.readyState ?? "missing", label: microphone?.label ?? "" },
      computerAudio: { available: Boolean(computerAudio), enabled: Boolean(computerAudio?.enabled), readyState: computerAudio?.readyState ?? "missing", label: computerAudio?.label ?? "" },
      pointerMetadata: this.pointerMetadataAvailable,
    });
  }

  private startPointerCapture(): void {
    this.pointerCapture = new PointerCaptureSession({
      target: window,
      onCapture: (event) => {
        if (!this.project || !this.pointerMetadataAvailable || document.visibilityState !== "visible") return;
        this.project.pointerEvents.push(event);
        this.callbacks.onPointerDiagnostic?.({ count: this.project.pointerEvents.length, time: event.time, x: event.x, y: event.y });
      },
    });
    this.pointerCapture.start();
  }

  private stopPointerCapture(): number {
    const elapsed = this.pointerCapture?.stop() ?? 0;
    this.pointerCapture = undefined;
    return elapsed;
  }
}
