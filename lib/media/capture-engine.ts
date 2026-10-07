import { LocalProjectStore } from "@/lib/storage/project-store";
import { createProject } from "@/lib/project";
import type { RecordingMode, StudioProject } from "@/types/project";

type CaptureCallbacks = {
  onState: (state: "requesting" | "ready" | "recording" | "paused" | "stopped") => void;
  onError: (message: string) => void;
};

export class CaptureEngine {
  private screen?: MediaStream;
  private camera?: MediaStream;
  private microphone?: MediaStream;
  private recorders: MediaRecorder[] = [];
  private project?: StudioProject;
  private startedAt = 0;

  constructor(private store: LocalProjectStore, private callbacks: CaptureCallbacks) {}

  get streams() {
    return { screen: this.screen, camera: this.camera, microphone: this.microphone };
  }

  async prepare(mode: RecordingMode, microphone = true): Promise<void> {
    this.dispose();
    this.callbacks.onState("requesting");
    try {
      if (mode !== "camera") {
        this.screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        this.screen.getVideoTracks()[0]?.addEventListener("ended", () => this.stop());
      }
      if (mode !== "screen") this.camera = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (microphone) this.microphone = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.project = createProject(mode);
      this.callbacks.onState("ready");
    } catch (error) {
      this.dispose();
      const name = error instanceof DOMException ? error.name : "CaptureError";
      this.callbacks.onError(name === "NotAllowedError" ? "Permission was not granted. You can retry and choose a different source." : "The selected source could not be opened.");
      throw error;
    }
  }

  async start(): Promise<void> {
    if (!this.project) throw new Error("Prepare the recording before starting.");
    await this.store.putProject(this.project);
    this.recorders = [];
    const sources: Array<[StudioProject["sources"][number]["kind"], MediaStream | undefined]> = [
      ["screen", this.screen && new MediaStream(this.screen.getVideoTracks())],
      ["computer-audio", this.screen?.getAudioTracks().length ? new MediaStream(this.screen.getAudioTracks()) : undefined],
      ["camera", this.camera],
      ["microphone", this.microphone],
    ];
    for (const [source, stream] of sources) {
      if (!stream) continue;
      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
        .find((value) => MediaRecorder.isTypeSupported(value));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined);
      let index = 0;
      recorder.ondataavailable = (event) => {
        if (event.data.size) void this.store.putChunk(this.project!.id, source, index++, event.data);
      };
      recorder.start(2_000);
      this.recorders.push(recorder);
      this.project.sources.push({ kind: source, chunkCount: 0, mimeType: recorder.mimeType });
    }
    this.startedAt = performance.now();
    this.callbacks.onState("recording");
  }

  pause(): void {
    this.recorders.forEach((recorder) => recorder.state === "recording" && recorder.pause());
    this.callbacks.onState("paused");
  }

  resume(): void {
    this.recorders.forEach((recorder) => recorder.state === "paused" && recorder.resume());
    this.callbacks.onState("recording");
  }

  async stop(): Promise<StudioProject | undefined> {
    await Promise.all(this.recorders.map((recorder) => new Promise<void>((resolve) => {
      if (recorder.state === "inactive") return resolve();
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.stop();
    })));
    if (this.project) {
      this.project.duration = Math.max(0, (performance.now() - this.startedAt) / 1000);
      this.project.updatedAt = new Date().toISOString();
      await this.store.putProject(this.project);
    }
    this.dispose();
    this.callbacks.onState("stopped");
    return this.project;
  }

  dispose(): void {
    [this.screen, this.camera, this.microphone].forEach((stream) => stream?.getTracks().forEach((track) => track.stop()));
    this.screen = this.camera = this.microphone = undefined;
    this.recorders = [];
  }
}
