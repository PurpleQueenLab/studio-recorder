import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  VideoSample,
  VideoSampleSink,
  type StreamTargetChunk,
} from "mediabunny";
import { LocalProjectStore } from "@/lib/storage/project-store";
import { editedTimestamp, sanitizeFilename } from "@/lib/project";
import type { StudioProject } from "@/types/project";

type ExportProgress = (progress: number) => void;
type SaveWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
};

export interface ExportReceipt {
  filename: string;
  size: number;
  videoCodec: string;
  audioCodec: string | null;
  sampleRate: number | null;
  channels: number | null;
  duration: number;
}

export async function runMp4SelfTest(): Promise<ExportReceipt> {
  const canvas = new OffscreenCanvas(640, 360);
  const context = canvas.getContext("2d")!;
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const video = new CanvasSource(canvas, { codec: "avc", quality: new Quality("medium") });
  const audio = new AudioBufferSource({ codec: "aac", quality: new Quality("medium") });
  output.addVideoTrack(video, { frameRate: 30 });
  output.addAudioTrack(audio);
  await output.start();
  for (let frame = 0; frame < 30; frame += 1) {
    context.fillStyle = frame % 2 ? "#6957e8" : "#181922";
    context.fillRect(0, 0, 640, 360);
    context.fillStyle = "#fff";
    context.font = "600 28px system-ui";
    context.fillText("Studio Recorder MP4 check", 132, 190);
    await video.add(frame / 30, 1 / 30, frame === 0 ? { keyFrame: true } : undefined);
  }
  const buffer = new AudioBuffer({ length: 48_000, numberOfChannels: 2, sampleRate: 48_000 });
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let sample = 0; sample < data.length; sample += 1) data[sample] = Math.sin(2 * Math.PI * 440 * sample / 48_000) * .03;
  }
  await audio.add(buffer);
  await output.finalize();
  return validateCompatibleMp4(new Blob([target.buffer!], { type: "video/mp4" }), "self-test.mp4");
}

export async function exportCompatibleMp4(project: StudioProject, onProgress: ExportProgress): Promise<ExportReceipt> {
  const store = new LocalProjectStore();
  const videoKind = project.mode === "camera" ? "camera" : "screen";
  const videoBlob = await sourceBlob(store, project, videoKind);
  const cameraBlob = project.mode === "screen-camera" ? await sourceBlob(store, project, "camera") : null;
  const audioKind = project.sources.some((source) => source.kind === "export-audio")
    ? "export-audio"
    : project.sources.some((source) => source.kind === "computer-audio") ? "computer-audio" : "microphone";
  const audioBlob = await sourceBlob(store, project, audioKind);
  if (!videoBlob) throw new Error("The project has no recoverable video source.");

  const filename = `${sanitizeFilename(project.title)}.mp4`;
  const saveWindow = window as SaveWindow;
  const useFileStream = project.duration > 20 * 60 && Boolean(saveWindow.showSaveFilePicker);
  if (project.duration > 20 * 60 && !useFileStream) {
    throw new Error("This long export needs Chrome or Edge file streaming. Open the project there and try again.");
  }

  let fileHandle: FileSystemFileHandle | undefined;
  let bufferTarget: BufferTarget | undefined;
  let target: BufferTarget | StreamTarget;
  if (useFileStream) {
    fileHandle = await saveWindow.showSaveFilePicker!({
      suggestedName: filename,
      types: [{ description: "Compatible MP4 video", accept: { "video/mp4": [".mp4"] } }],
    });
    const writable = await fileHandle.createWritable();
    target = new StreamTarget(writable as unknown as WritableStream<StreamTargetChunk>, { chunked: true });
  } else {
    bufferTarget = new BufferTarget();
    target = bufferTarget;
  }

  const format = new Mp4OutputFormat({ fastStart: bufferTarget ? "in-memory" : false });
  const output = new Output({ format, target });
  const videoInput = new Input({ formats: ALL_FORMATS, source: new BlobSource(videoBlob) });
  const outputSize = outputDimensions(project.canvas.aspectRatio);
  let cameraSink: VideoSampleSink | undefined;
  if (cameraBlob) {
    const cameraInput = new Input({ formats: ALL_FORMATS, source: new BlobSource(cameraBlob) });
    const cameraTrack = await cameraInput.getPrimaryVideoTrack();
    if (cameraTrack) cameraSink = new VideoSampleSink(cameraTrack, { optimizeForLatency: true });
  }
  const compositor = createCompositor(project, outputSize.width, outputSize.height, cameraSink);
  const trim = { start: project.trim.start, end: project.trim.end ?? project.duration };

  const videoConversion = await Conversion.init({
    input: videoInput,
    output,
    composable: true,
    copy: false,
    audio: { discard: true },
    trim,
    video: {
      codec: "avc",
      quality: new Quality("high"),
      frameRate: 30,
      keyFrameInterval: 2,
      forceTranscode: true,
      processedWidth: outputSize.width,
      processedHeight: outputSize.height,
      process: compositor,
    },
    tags: { title: project.title },
    showWarnings: false,
  });
  if (!videoConversion.isValid) throw new Error("H.264 encoding is not supported by this browser/device.");

  let audioConversion: Conversion | undefined;
  if (audioBlob) {
    const audioInput = new Input({ formats: ALL_FORMATS, source: new BlobSource(audioBlob) });
    audioConversion = await Conversion.init({
      input: audioInput,
      output,
      composable: true,
      video: { discard: true },
      trim,
      copy: false,
      audio: {
        codec: "aac",
        numberOfChannels: 2,
        sampleRate: 48_000,
        quality: new Quality("high"),
        forceTranscode: true,
        process: (sample) => {
          const shifted = editedTimestamp(project, sample.timestamp, trim.start);
          if (shifted === null) return null;
          sample.setTimestamp(shifted);
          return sample;
        },
      },
      showWarnings: false,
    });
    if (!audioConversion.isValid) throw new Error("AAC-LC encoding is not supported by this browser/device.");
  }

  videoConversion.onProgress = (value) => onProgress(value * (audioConversion ? 0.85 : 1));
  if (audioConversion) audioConversion.onProgress = (value) => onProgress(0.85 + value * 0.15);
  await output.start();
  await Promise.all([videoConversion.execute(), audioConversion?.execute()]);
  await output.finalize();
  onProgress(1);

  const resultBlob = bufferTarget
    ? new Blob([bufferTarget.buffer!], { type: "video/mp4" })
    : await fileHandle!.getFile();
  try {
    const receipt = await validateCompatibleMp4(resultBlob, filename);
    if (bufferTarget) downloadBlob(resultBlob, filename);
    return receipt;
  } catch (error) {
    if (fileHandle) {
      const writable = await fileHandle.createWritable();
      await writable.truncate(0);
      await writable.close();
    }
    throw error;
  }
}

async function sourceBlob(store: LocalProjectStore, project: StudioProject, kind: string): Promise<Blob | null> {
  const descriptor = project.sources.find((source) => source.kind === kind);
  if (!descriptor) return null;
  const chunks = await store.getChunks(project.id, kind);
  return chunks.length ? new Blob(chunks, { type: descriptor.mimeType }) : null;
}

function outputDimensions(aspectRatio: StudioProject["canvas"]["aspectRatio"]) {
  if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
  if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
  if (aspectRatio === "4:5") return { width: 1080, height: 1350 };
  return { width: 1920, height: 1080 };
}

function createCompositor(project: StudioProject, width: number, height: number, cameraSink?: VideoSampleSink) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d")!;
  return async (sample: VideoSample): Promise<VideoSample | null> => {
    const sourceTimestamp = sample.timestamp + project.trim.start;
    const shiftedTimestamp = editedTimestamp(project, sample.timestamp, project.trim.start);
    if (shiftedTimestamp === null) return null;
    context.fillStyle = project.canvas.background;
    context.fillRect(0, 0, width, height);
    const zoom = activeZoom(project, sample.timestamp);
    const crop = project.crop;
    const scale = zoom?.scale ?? 1;
    const sourceWidth = sample.displayWidth * crop.width / scale;
    const sourceHeight = sample.displayHeight * crop.height / scale;
    const focalX = zoom?.x ?? 0.5;
    const focalY = zoom?.y ?? 0.5;
    const sourceX = clamp(sample.displayWidth * (crop.x + crop.width * focalX) - sourceWidth / 2, sample.displayWidth * crop.x, sample.displayWidth * (crop.x + crop.width) - sourceWidth);
    const sourceY = clamp(sample.displayHeight * (crop.y + crop.height * focalY) - sourceHeight / 2, sample.displayHeight * crop.y, sample.displayHeight * (crop.y + crop.height) - sourceHeight);
    const frameScale = project.canvas.scale;
    const boxWidth = width * frameScale;
    const boxHeight = height * frameScale;
    let targetWidth = boxWidth;
    let targetHeight = boxHeight;
    if (project.canvas.fit === "fit") {
      const sourceRatio = sourceWidth / sourceHeight;
      const boxRatio = boxWidth / boxHeight;
      if (sourceRatio > boxRatio) targetHeight = boxWidth / sourceRatio;
      else targetWidth = boxHeight * sourceRatio;
    }
    context.save();
    context.shadowColor = "rgba(0,0,0,.34)";
    context.shadowBlur = 42;
    context.shadowOffsetY = 18;
    sample.draw(context, sourceX, sourceY, sourceWidth, sourceHeight, (width - targetWidth) / 2, (height - targetHeight) / 2, targetWidth, targetHeight);
    context.restore();
    if (cameraSink && project.camera.visible) {
      const cameraSample = await cameraSink.getSample(sourceTimestamp);
      if (cameraSample) {
        drawCameraBubble(context, cameraSample, width, height, project);
        cameraSample.close();
      }
    }
    if (zoom && project.cursor.style !== "hidden") drawCursor(context, width * zoom.x, height * zoom.y, project);
    return new VideoSample(canvas, { timestamp: shiftedTimestamp, duration: sample.duration });
  };
}

function activeZoom(project: StudioProject, time: number): { scale: number; x: number; y: number } | null {
  const event = project.zoomEvents.find((item) => time >= item.time - 0.15 && time <= item.time + item.duration);
  if (!event) return null;
  const local = time - (event.time - 0.15);
  const easeInEnd = 0.45;
  const easeOutStart = Math.max(easeInEnd, event.duration - 0.35);
  let amount = 1;
  if (local < easeInEnd) amount = ease(local / easeInEnd);
  else if (local > easeOutStart) amount = 1 - ease((local - easeOutStart) / 0.35);
  return { scale: 1 + (event.scale - 1) * clamp(amount, 0, 1), x: event.x, y: event.y };
}

function drawCursor(context: OffscreenCanvasRenderingContext2D, x: number, y: number, project: StudioProject) {
  const size = 18 * project.cursor.size;
  context.save();
  context.globalAlpha = project.cursor.opacity;
  if (project.cursor.shadow) { context.shadowColor = "rgba(0,0,0,.45)"; context.shadowBlur = 8; }
  context.fillStyle = "#fff";
  context.strokeStyle = "#17171c";
  context.lineWidth = 2;
  context.beginPath();
  if (project.cursor.style === "system" || project.cursor.style === "arrow") {
    context.moveTo(x, y);
    context.lineTo(x + size * .35, y + size);
    context.lineTo(x + size * .58, y + size * .62);
    context.lineTo(x + size, y + size * .54);
    context.closePath();
  } else context.arc(x, y, project.cursor.style === "large-dot" ? size : size * .62, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();
}

function drawCameraBubble(context: OffscreenCanvasRenderingContext2D, sample: VideoSample, width: number, height: number, project: StudioProject) {
  const rect = project.camera.rect;
  const x = rect.x * width;
  const y = rect.y * height;
  const bubbleWidth = rect.width * width;
  const bubbleHeight = rect.height * height;
  context.save();
  context.beginPath();
  if (project.camera.shape === "circle") context.ellipse(x + bubbleWidth / 2, y + bubbleHeight / 2, bubbleWidth / 2, bubbleHeight / 2, 0, 0, Math.PI * 2);
  else context.roundRect(x, y, bubbleWidth, bubbleHeight, project.camera.shape === "rounded" ? Math.min(bubbleWidth, bubbleHeight) * .12 : 0);
  context.clip();
  sample.draw(context, 0, 0, sample.displayWidth, sample.displayHeight, x, y, bubbleWidth, bubbleHeight);
  context.restore();
  context.save();
  context.strokeStyle = "rgba(255,255,255,.9)";
  context.lineWidth = Math.max(2, width / 640);
  if (project.camera.shape === "circle") {
    context.beginPath();
    context.ellipse(x + bubbleWidth / 2, y + bubbleHeight / 2, bubbleWidth / 2, bubbleHeight / 2, 0, 0, Math.PI * 2);
    context.stroke();
  } else {
    context.strokeRect(x, y, bubbleWidth, bubbleHeight);
  }
  context.restore();
}

async function validateCompatibleMp4(blob: Blob, filename: string): Promise<ExportReceipt> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  const tracks = await input.getTracks();
  const videos = tracks.filter((track) => track.isVideoTrack());
  const audios = tracks.filter((track) => track.isAudioTrack());
  if (videos.length !== 1 || audios.length > 1) throw new Error("Export validation failed: unexpected track layout.");
  const video = videos[0];
  const audio = audios[0];
  const videoCodec = await video.getCodec();
  const audioCodec = audio ? await audio.getCodec() : null;
  const firstVideoTimestamp = await video.getFirstTimestamp();
  const firstAudioTimestamp = audio ? await audio.getFirstTimestamp() : 0;
  if (videoCodec !== "avc" || (audio && audioCodec !== "aac")) throw new Error("Export validation failed: output is not H.264/AAC MP4.");
  if (firstVideoTimestamp < 0 || firstAudioTimestamp < 0) throw new Error("Export validation failed: negative media timestamps.");
  const sampleRate = audio ? await audio.getSampleRate() : null;
  const channels = audio ? await audio.getNumberOfChannels() : null;
  if (audio && (sampleRate !== 48_000 || channels !== 2)) throw new Error("Export validation failed: audio is not 48 kHz stereo.");
  const duration = await input.computeDuration();
  if (!(duration > 0) || !(await video.canDecode()) || (audio && !(await audio.canDecode()))) throw new Error("Export validation failed: media could not be decoded.");
  return { filename, size: blob.size, videoCodec, audioCodec, sampleRate, channels, duration };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const ease = (value: number) => 1 - Math.pow(1 - value, 3);
