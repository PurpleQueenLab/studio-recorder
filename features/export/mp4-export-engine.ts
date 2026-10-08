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
  VideoSampleSource,
  type StreamTargetChunk,
} from "mediabunny";
import { LocalProjectStore } from "@/lib/storage/project-store";
import { editedTimestamp, formatExportFallback, primaryVideoSourceKind, sanitizeFilename, videoClipDuration } from "@/lib/project";
import { previewPointFromSource, zoomSourceRect, zoomTransformAt } from "@/lib/editor/composition";
import { cameraPixelRect, coverSourceRect } from "@/lib/editor/camera-geometry";
import { renderProjectAudioMix } from "@/lib/media/audio-mixer";
import { exportVideoBitrate, RESOLUTION_PRESETS } from "@/lib/media/quality";
import type { StudioProject } from "@/types/project";

export type ExportStage = "Preparing video" | "Rendering" | "Encoding audio" | "Finalizing MP4";
type ExportProgress = (progress: number, stage: ExportStage) => void;
export type SaveWindow = Pick<Window, never> & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
};

export type ExportDestination = {
  fileHandle?: FileSystemFileHandle;
  bufferTarget?: BufferTarget;
  target: BufferTarget | StreamTarget;
  saveFallbackUsed: boolean;
};

export interface ExportReceipt {
  filename: string;
  size: number;
  videoCodec: string;
  audioCodec: string | null;
  sampleRate: number | null;
  channels: number | null;
  duration: number;
  width: number;
  height: number;
  saveFallbackUsed?: boolean;
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
  return validateCompatibleMp4(new Blob([target.buffer!], { type: "video/mp4" }), "self-test.mp4", true, { width: 640, height: 360 });
}

export async function exportCompatibleMp4(project: StudioProject, onProgress: ExportProgress, requestedName?: string, onSaveFallback?: () => void): Promise<ExportReceipt> {
  onProgress(.01, "Preparing video");
  const store = new LocalProjectStore();
  const videoKind = primaryVideoSourceKind(project.mode);
  const videoBlob = await clipSourceBlob(store, project, project.videoClips[0]?.sourceId ?? videoKind);
  const cameraBlob = project.mode === "screen-camera" ? await sourceBlob(store, project, "camera") : null;
  if (!videoBlob) throw new Error("The project has no recoverable video source.");
  const audioBuffer = await renderProjectAudioMix(project, store);
  onProgress(.08, audioBuffer ? "Encoding audio" : "Preparing video");

  const baseName = (requestedName || project.title).replace(/\.mp4$/i, "").trim() || formatExportFallback();
  const filename = `${sanitizeFilename(baseName)}.mp4`;
  const saveWindow = window as SaveWindow;
  const destination = await createExportDestination(saveWindow, filename);
  const { fileHandle, bufferTarget, target, saveFallbackUsed } = destination;
  if (saveFallbackUsed) onSaveFallback?.();

  const format = new Mp4OutputFormat({ fastStart: bufferTarget ? "in-memory" : false });
  const output = new Output({ format, target });
  output.setMetadataTags({ title: project.title });
  const videoInput = new Input({ formats: ALL_FORMATS, source: new BlobSource(videoBlob) });
  const outputSize = outputDimensions(project);
  let cameraSink: VideoSampleSink | undefined;
  if (cameraBlob) {
    const cameraInput = new Input({ formats: ALL_FORMATS, source: new BlobSource(cameraBlob) });
    const cameraTrack = await cameraInput.getPrimaryVideoTrack();
    if (cameraTrack) cameraSink = new VideoSampleSink(cameraTrack, { optimizeForLatency: true });
  }
  const backgroundBitmap = await loadBackgroundBitmap(project, store);
  const compositor = createCompositor(project, outputSize.width, outputSize.height, cameraSink, backgroundBitmap);
  const trim = { start: project.trim.start, end: project.trim.end ?? project.duration };

  const useClipTimeline = project.videoClips.length > 1 || project.videoClips.some((clip) => clip.sourceId !== videoKind || clip.sourceIn > .001 || clip.sourceOut < project.duration - .001);
  const videoConversion = useClipTimeline ? null : await Conversion.init({
    input: videoInput,
    output,
    composable: true,
    copy: false,
    audio: { discard: true },
    trim,
    video: {
      codec: "avc",
      quality: new Quality({ bitrate: exportVideoBitrate(project.quality.resolution, project.quality.frameRate, project.quality.level), bitrateMode: "variable" }),
      frameRate: project.quality.frameRate,
      keyFrameInterval: 2,
      forceTranscode: true,
      processedWidth: outputSize.width,
      processedHeight: outputSize.height,
      process: compositor,
    },
    showWarnings: false,
  });
  if (videoConversion && !videoConversion.isValid) throw new Error("H.264 encoding is not supported by this browser/device.");
  let timelineVideo: VideoSampleSource | undefined;
  if (useClipTimeline) {
    timelineVideo = new VideoSampleSource({ codec: "avc", quality: new Quality({ bitrate: exportVideoBitrate(project.quality.resolution, project.quality.frameRate, project.quality.level), bitrateMode: "variable" }) });
    output.addVideoTrack(timelineVideo, { frameRate: project.quality.frameRate });
  }

  let audioSource: AudioBufferSource | undefined;
  if (audioBuffer) {
    audioSource = new AudioBufferSource({ codec: "aac", quality: new Quality("high") });
    output.addAudioTrack(audioSource, { name: "Studio Recorder mix" });
  }
  if (videoConversion) videoConversion.onProgress = (value) => onProgress(.1 + value * .78, "Rendering");
  await output.start();
  try {
    await Promise.all([videoConversion ? videoConversion.execute() : renderClipTimeline(project, store, timelineVideo!, compositor, onProgress), audioSource?.add(audioBuffer!)]);
  } finally {
    backgroundBitmap?.close();
  }
  onProgress(.9, "Finalizing MP4");
  await output.finalize();
  onProgress(1, "Finalizing MP4");

  const resultBlob = bufferTarget
    ? new Blob([bufferTarget.buffer!], { type: "video/mp4" })
    : await fileHandle!.getFile();
  try {
    const receipt = await validateCompatibleMp4(resultBlob, filename, Boolean(audioBuffer), outputSize);
    if (bufferTarget) downloadBlob(resultBlob, filename);
    return { ...receipt, saveFallbackUsed };
  } catch (error) {
    if (fileHandle) {
      const writable = await fileHandle.createWritable();
      await writable.truncate(0);
      await writable.close();
    }
    throw error;
  }
}

export async function createExportDestination(saveWindow: SaveWindow, filename: string): Promise<ExportDestination> {
  if (saveWindow.showSaveFilePicker) {
    try {
      const fileHandle = await saveWindow.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "Compatible MP4 video", accept: { "video/mp4": [".mp4"] } }],
      });
      const writable = await fileHandle.createWritable();
      return { fileHandle, target: new StreamTarget(writable as unknown as WritableStream<StreamTargetChunk>, { chunked: true }), saveFallbackUsed: false };
    } catch { /* Fall through to the browser download target. */ }
  }
  const bufferTarget = new BufferTarget();
  return { bufferTarget, target: bufferTarget, saveFallbackUsed: true };
}

async function sourceBlob(store: LocalProjectStore, project: StudioProject, kind: string): Promise<Blob | null> {
  const descriptor = project.sources.find((source) => source.kind === kind);
  if (!descriptor) return null;
  const chunks = await store.getChunks(project.id, kind);
  return chunks.length ? new Blob(chunks, { type: descriptor.mimeType }) : null;
}

async function clipSourceBlob(store: LocalProjectStore, project: StudioProject, sourceId: string): Promise<Blob | null> {
  const asset = project.assets.find((item) => item.id === sourceId);
  if (asset) { const chunks = await store.getChunks(project.id, sourceId); return chunks.length ? new Blob(chunks, { type: asset.mimeType }) : null; }
  return sourceBlob(store, project, sourceId);
}

async function renderClipTimeline(project: StudioProject, store: LocalProjectStore, target: VideoSampleSource, fallbackCompositor: ReturnType<typeof createCompositor>, onProgress: ExportProgress) {
  const frameDuration = 1 / project.quality.frameRate;
  const trimEnd = project.trim.end ?? project.duration;
  let rendered = 0;
  const expected = Math.max(1, Math.ceil((trimEnd - project.trim.start) / frameDuration));
  for (const clip of project.videoClips) {
    const blob = await clipSourceBlob(store, project, clip.sourceId);
    if (!blob) throw new Error(`The source for “${clip.name}” is missing from local storage.`);
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error(`The browser cannot decode “${clip.name}”.`);
    const sink = new VideoSampleSink(track, { optimizeForLatency: true });
    const start = Math.max(clip.timelineStart, project.trim.start);
    const end = Math.min(clip.timelineStart + videoClipDuration(clip), trimEnd);
    for (let timelineTime = start; timelineTime < end - frameDuration / 2; timelineTime += frameDuration) {
      const sourceTime = clip.sourceIn + timelineTime - clip.timelineStart;
      const sample = await sink.getSample(sourceTime);
      if (!sample) continue;
      const frame = sample.toVideoFrame();
      const shifted = new VideoSample(frame, { timestamp: timelineTime - project.trim.start, duration: frameDuration });
      const mapped = await fallbackCompositor(shifted);
      shifted.close(); frame.close();
      sample.close();
      if (mapped) { await target.add(mapped, rendered % (project.quality.frameRate * 2) === 0 ? { keyFrame: true } : undefined); mapped.close(); }
      rendered += 1;
      if (rendered % 12 === 0) onProgress(.1 + Math.min(1, rendered / expected) * .78, "Rendering");
    }
  }
}

export function outputDimensions(project: StudioProject) {
  const preset = RESOLUTION_PRESETS[project.quality.resolution];
  const aspectRatio = project.canvas.aspectRatio;
  let target = aspectRatio === "9:16" ? { width: preset.height, height: preset.width }
    : aspectRatio === "1:1" ? { width: preset.height, height: preset.height }
      : aspectRatio === "4:5" ? { width: preset.height, height: preset.height * 1.25 }
        : { width: preset.width, height: preset.height };
  const source = project.sources.find((item) => item.kind === primaryVideoSourceKind(project.mode));
  const sourceWidth = source?.width ?? project.quality.width;
  const sourceHeight = source?.height ?? project.quality.height;
  const scale = Math.min(1, sourceWidth / target.width, sourceHeight / target.height);
  target = { width: even(target.width * scale), height: even(target.height * scale) };
  return target;
}

function createCompositor(project: StudioProject, width: number, height: number, cameraSink?: VideoSampleSink, backgroundBitmap?: ImageBitmap) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d")!;
  return async (sample: VideoSample): Promise<VideoSample | null> => {
    const sourceTimestamp = sample.timestamp + project.trim.start;
    const shiftedTimestamp = editedTimestamp(project, sample.timestamp, project.trim.start);
    if (shiftedTimestamp === null) return null;
    drawBackground(context, sample, width, height, project, backgroundBitmap);
    const zoom = zoomTransformAt(project, sourceTimestamp);
    const sourceRect = zoomSourceRect(project, sourceTimestamp);
    const sourceWidth = sample.displayWidth * sourceRect.width;
    const sourceHeight = sample.displayHeight * sourceRect.height;
    const sourceX = sample.displayWidth * sourceRect.x;
    const sourceY = sample.displayHeight * sourceRect.y;
    const frameScale = project.presentation.scale * (1 - project.presentation.padding * 2);
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
    const targetX = (width - targetWidth) * project.presentation.x;
    const targetY = (height - targetHeight) * project.presentation.y;
    context.save();
    const radius = project.presentation.cornerRadius * width / 1920;
    context.shadowColor = "rgba(0,0,0,.34)";
    context.shadowBlur = 52 * project.presentation.shadow;
    context.shadowOffsetY = 20 * project.presentation.shadow;
    context.fillStyle = "#050609";
    roundedRectPath(context, targetX, targetY, targetWidth, targetHeight, radius);
    context.fill();
    context.restore();
    context.save();
    roundedRectPath(context, targetX, targetY, targetWidth, targetHeight, radius);
    context.clip();
    sample.draw(context, sourceX, sourceY, sourceWidth, sourceHeight, targetX, targetY, targetWidth, targetHeight);
    context.restore();
    drawFrame(context, targetX, targetY, targetWidth, targetHeight, radius, project);
    if (cameraSink && project.camera.visible) {
      const cameraSample = await cameraSink.getSample(sourceTimestamp);
      if (cameraSample) {
        drawCameraBubble(context, cameraSample, width, height, project);
        cameraSample.close();
      }
    }
    if (zoom && project.cursor.style !== "hidden") {
      const cursor = previewPointFromSource(project, sourceTimestamp, zoom.x, zoom.y);
      drawCursor(context, targetX + targetWidth * cursor.x, targetY + targetHeight * cursor.y, project);
    }
    return new VideoSample(canvas, { timestamp: shiftedTimestamp, duration: sample.duration });
  };
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
  const rect = cameraPixelRect(project.camera.rect, project.camera.shape, width, height);
  const { x, y, width: bubbleWidth, height: bubbleHeight } = rect;
  const source = coverSourceRect(sample.displayWidth, sample.displayHeight, bubbleWidth, bubbleHeight);
  context.save();
  context.beginPath();
  if (project.camera.shape === "circle") context.arc(x + bubbleWidth / 2, y + bubbleHeight / 2, bubbleWidth / 2, 0, Math.PI * 2);
  else context.roundRect(x, y, bubbleWidth, bubbleHeight, project.camera.shape === "rounded" ? Math.min(bubbleWidth, bubbleHeight) * .12 : 0);
  context.clip();
  sample.draw(context, source.x, source.y, source.width, source.height, x, y, bubbleWidth, bubbleHeight);
  context.restore();
  context.save();
  context.strokeStyle = "rgba(255,255,255,.9)";
  context.lineWidth = Math.max(2, width / 640);
  if (project.camera.shape === "circle") {
    context.beginPath();
    context.arc(x + bubbleWidth / 2, y + bubbleHeight / 2, bubbleWidth / 2, 0, Math.PI * 2);
    context.stroke();
  } else {
    context.strokeRect(x, y, bubbleWidth, bubbleHeight);
  }
  context.restore();
}

const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2);

export async function validateCompatibleMp4(blob: Blob, filename: string, expectAudio = false, expectedSize?: { width: number; height: number }): Promise<ExportReceipt> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  const tracks = await input.getTracks();
  const videos = tracks.filter((track) => track.isVideoTrack());
  const audios = tracks.filter((track) => track.isAudioTrack());
  if (videos.length !== 1 || audios.length > 1 || (expectAudio && audios.length !== 1)) throw new Error("Export validation failed: unexpected track layout.");
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
  const width = await video.getDisplayWidth();
  const height = await video.getDisplayHeight();
  if (expectedSize && (width !== expectedSize.width || height !== expectedSize.height)) throw new Error("Export validation failed: output dimensions are incorrect.");
  return { filename, size: blob.size, videoCodec, audioCodec, sampleRate, channels, duration, width, height };
}

async function loadBackgroundBitmap(project: StudioProject, store: LocalProjectStore): Promise<ImageBitmap | undefined> {
  if (project.background.type !== "image" || !project.background.assetId) return;
  const asset = project.assets.find((item) => item.id === project.background.assetId);
  if (!asset) return;
  const chunks = await store.getChunks(project.id, asset.id);
  return chunks.length ? createImageBitmap(new Blob(chunks, { type: asset.mimeType })) : undefined;
}

function drawBackground(context: OffscreenCanvasRenderingContext2D, sample: VideoSample, width: number, height: number, project: StudioProject, bitmap?: ImageBitmap) {
  const background = project.background;
  context.save();
  context.filter = `brightness(${background.brightness}) blur(${background.type === "blurred-source" || background.type === "image" ? background.blur : 0}px)`;
  if (background.type === "blurred-source") {
    const overscan = background.blur * 2;
    sample.draw(context, 0, 0, sample.displayWidth, sample.displayHeight, -overscan, -overscan, width + overscan * 2, height + overscan * 2);
  } else if (background.type === "image" && bitmap) {
    drawImageFitted(context, bitmap, width, height, background.fit);
  } else if (background.type === "gradient" || background.type === "wallpaper") {
    const gradient = context.createLinearGradient(0, 0, width, height);
    const colors = background.value.match(/#[0-9a-fA-F]{6}/g) ?? ["#7563ea", "#242042"];
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(1, colors[1] ?? colors[0]);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    if (background.type === "wallpaper") drawWallpaper(context, width, height);
  } else {
    context.fillStyle = background.value || project.canvas.background;
    context.fillRect(0, 0, width, height);
  }
  context.restore();
}

function drawImageFitted(context: OffscreenCanvasRenderingContext2D, image: ImageBitmap, width: number, height: number, fit: "fit" | "fill") {
  const scale = fit === "fill" ? Math.max(width / image.width, height / image.height) : Math.min(width / image.width, height / image.height);
  const targetWidth = image.width * scale;
  const targetHeight = image.height * scale;
  context.drawImage(image, (width - targetWidth) / 2, (height - targetHeight) / 2, targetWidth, targetHeight);
}

function drawWallpaper(context: OffscreenCanvasRenderingContext2D, width: number, height: number) {
  context.globalAlpha = .2;
  context.fillStyle = "#fff";
  for (let index = -2; index < 9; index += 1) {
    context.beginPath();
    context.arc(width * (.12 + index * .15), height * (.18 + (index % 3) * .24), width * .13, 0, Math.PI * 2);
    context.fill();
  }
}

function drawFrame(context: OffscreenCanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, project: StudioProject) {
  if (project.presentation.frame === "none") return;
  context.save();
  context.strokeStyle = "rgba(255,255,255,.72)";
  context.lineWidth = Math.max(2, width / 900);
  roundedRectPath(context, x, y, width, height, radius);
  context.stroke();
  if (project.presentation.frame === "browser" || project.presentation.frame === "macos") {
    context.fillStyle = "rgba(20,21,28,.9)";
    context.fillRect(x, y, width, Math.min(height * .07, 54));
    ["#ff5f57", "#febc2e", "#28c840"].forEach((color, index) => { context.fillStyle = color; context.beginPath(); context.arc(x + 20 + index * 22, y + 20, 6, 0, Math.PI * 2); context.fill(); });
  }
  context.restore();
}

function roundedRectPath(context: OffscreenCanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, Math.max(0, Math.min(radius, Math.min(width, height) / 2)));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
