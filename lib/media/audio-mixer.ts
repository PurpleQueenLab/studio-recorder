import { LocalProjectStore } from "@/lib/storage/project-store";
import { primaryVideoSourceKind } from "@/lib/project";
import type { AudioClip, AudioTrackType, StudioProject } from "@/types/project";

export interface TimelineSegment {
  sourceStart: number;
  sourceEnd: number;
  outputStart: number;
}

export interface AudioMixItem {
  key: string;
  clip: AudioClip;
}

export function visibleTimelineSegments(project: StudioProject): TimelineSegment[] {
  const start = project.trim.start;
  const end = Math.max(start, project.trim.end ?? project.duration);
  const deletions = project.edits
    .filter((edit) => edit.type === "delete" && edit.end > start && edit.start < end)
    .map((edit) => ({ start: Math.max(start, edit.start), end: Math.min(end, edit.end) }))
    .sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const deletion of deletions) {
    const previous = merged.at(-1);
    if (previous && deletion.start <= previous.end) previous.end = Math.max(previous.end, deletion.end);
    else merged.push({ ...deletion });
  }
  const segments: TimelineSegment[] = [];
  let cursor = start;
  let outputStart = 0;
  for (const deletion of merged) {
    if (deletion.start > cursor) {
      segments.push({ sourceStart: cursor, sourceEnd: deletion.start, outputStart });
      outputStart += deletion.start - cursor;
    }
    cursor = Math.max(cursor, deletion.end);
  }
  if (cursor < end) segments.push({ sourceStart: cursor, sourceEnd: end, outputStart });
  return segments;
}

export function outputDuration(project: StudioProject): number {
  return visibleTimelineSegments(project).reduce((duration, segment) => duration + segment.sourceEnd - segment.sourceStart, 0);
}

export function trackIsAudible(project: StudioProject, type: AudioTrackType): boolean {
  const track = project.audio.tracks[type];
  const hasSolo = Object.values(project.audio.tracks).some((item) => item.solo);
  return !track.muted && (!hasSolo || track.solo);
}

export function duckingMultiplier(project: StudioProject, type: AudioTrackType, timelineTime?: number): number {
  if (type !== "music" || !project.audio.ducking.enabled) return 1;
  const hasOriginalNarration = trackIsAudible(project, "microphone") && project.sources.some((source) => source.kind === "microphone");
  const hasVoiceover = trackIsAudible(project, "voiceover") && project.audio.clips.some((clip) => {
    if (clip.trackType !== "voiceover" || clip.muted) return false;
    if (timelineTime === undefined) return true;
    return timelineTime >= clip.startTime && timelineTime < clip.startTime + clip.sourceOut - clip.sourceIn;
  });
  const narration = hasOriginalNarration || hasVoiceover;
  if (!narration) return 1;
  return project.audio.ducking.amount === "light" ? .65 : project.audio.ducking.amount === "strong" ? .28 : .45;
}

export function trackFadeAt(project: StudioProject, type: AudioTrackType, timelineTime: number): number {
  const track = project.audio.tracks[type];
  const fadeIn = track.fadeIn > 0 ? Math.min(1, timelineTime / track.fadeIn) : 1;
  const fadeOut = track.fadeOut > 0 ? Math.min(1, (project.duration - timelineTime) / track.fadeOut) : 1;
  return Math.max(0, Math.min(fadeIn, fadeOut, 1));
}

export function clipGainAt(clip: Pick<AudioClip, "volume" | "fadeIn" | "fadeOut" | "sourceIn" | "sourceOut">, localTime: number): number {
  const duration = Math.max(0, clip.sourceOut - clip.sourceIn);
  const fadeIn = clip.fadeIn > 0 ? Math.min(1, localTime / clip.fadeIn) : 1;
  const fadeOut = clip.fadeOut > 0 ? Math.min(1, (duration - localTime) / clip.fadeOut) : 1;
  return clip.volume * Math.max(0, Math.min(fadeIn, fadeOut, 1));
}

export function audioMixItems(project: StudioProject): AudioMixItem[] {
  const items: AudioMixItem[] = [];
  const primaryVideo = primaryVideoSourceKind(project.mode);
  const sourceTimeline = project.videoClips.filter((clip) => clip.sourceId === primaryVideo);
  for (const type of ["microphone", "computer-audio"] as const) {
    if (!project.sources.some((source) => source.kind === type)) continue;
    const clips = sourceTimeline.length ? sourceTimeline : [{ id: "full", timelineStart: 0, sourceIn: 0, sourceOut: project.duration }];
    items.push(...clips.map((video) => ({
      key: type,
      clip: { id: `${type}-${video.id}`, sourceId: type, trackType: type, startTime: video.timelineStart, sourceIn: video.sourceIn, sourceOut: video.sourceOut, volume: 1, muted: false, fadeIn: 0, fadeOut: 0 },
    })));
  }
  items.push(...project.audio.clips.map((clip) => ({ key: clip.sourceId, clip })));
  items.push(...project.videoClips.filter((video) => project.assets.some((asset) => asset.id === video.sourceId && asset.kind === "video")).map((video) => ({
    key: video.sourceId,
    clip: { id: `video-audio-${video.id}`, sourceId: video.sourceId, trackType: "computer-audio" as const, startTime: video.timelineStart, sourceIn: video.sourceIn, sourceOut: video.sourceOut, volume: 1, muted: false, fadeIn: 0, fadeOut: 0 },
  })));
  return items;
}

export function audioMixHeadroom(project: StudioProject): number {
  const activeTrackCount = new Set(audioMixItems(project)
    .filter(({ clip }) => !clip.muted && trackIsAudible(project, clip.trackType))
    .map(({ clip }) => clip.trackType)).size;
  return .82 / Math.sqrt(Math.max(1, activeTrackCount));
}

export function audioMixGainAt(project: StudioProject, clip: AudioClip, timelineTime: number, headroom = audioMixHeadroom(project)): number {
  const localTime = timelineTime - clip.startTime;
  if (clip.muted || !trackIsAudible(project, clip.trackType) || localTime < 0 || localTime >= clip.sourceOut - clip.sourceIn) return 0;
  const track = project.audio.tracks[clip.trackType];
  return track.volume * headroom * clipGainAt(clip, localTime) * trackFadeAt(project, clip.trackType, timelineTime) * duckingMultiplier(project, clip.trackType, timelineTime);
}

export async function createWaveform(blob: Blob, points = 120): Promise<number[]> {
  if (blob.size > 200 * 1024 * 1024) return [];
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const channel = buffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channel.length / points));
    return Array.from({ length: points }, (_, index) => {
      const start = index * blockSize;
      const end = Math.min(channel.length, start + blockSize);
      let peak = 0;
      for (let offset = start; offset < end; offset += 1) peak = Math.max(peak, Math.abs(channel[offset]));
      return Math.round(peak * 1000) / 1000;
    });
  } finally {
    await context.close();
  }
}

export async function renderProjectAudioMix(project: StudioProject, store: LocalProjectStore): Promise<AudioBuffer | null> {
  const segments = visibleTimelineSegments(project);
  const duration = outputDuration(project);
  if (!segments.length || duration <= 0) return null;

  const items: Array<{ clip: AudioClip; blob: Blob; optional: boolean }> = [];
  for (const { clip } of audioMixItems(project)) {
    if (clip.muted || !trackIsAudible(project, clip.trackType)) continue;
    const descriptor = project.sources.find((source) => source.kind === clip.sourceId);
    const asset = project.assets.find((item) => item.id === clip.sourceId);
    const chunks = await store.getChunks(project.id, clip.sourceId);
    if (!chunks.length) {
      if (asset?.kind === "music" || asset?.kind === "voiceover") throw new Error(`The local audio for “${asset.name}” is missing. Re-import it before exporting.`);
      continue;
    }
    items.push({ clip, blob: new Blob(chunks, { type: asset?.mimeType ?? descriptor?.mimeType }), optional: asset?.kind === "video" });
  }
  if (!items.length) return null;

  const decoded = (await Promise.all(items.map(async ({ clip, blob, optional }) => {
    const buffer = await decodeAudioBlob(blob);
    if (!buffer) {
      if (optional) return null;
      throw new Error(`The browser could not decode the ${clip.trackType} audio for MP4 export.`);
    }
    return { clip, buffer };
  }))).filter((item): item is { clip: AudioClip; buffer: AudioBuffer } => Boolean(item));
  if (!decoded.length) return null;

  const offline = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * 48_000)), 48_000);
  const headroom = audioMixHeadroom(project);
  for (const { clip, buffer } of decoded) {
    const clipEnd = clip.startTime + clip.sourceOut - clip.sourceIn;
    for (const segment of segments) {
      const intersectionStart = Math.max(segment.sourceStart, clip.startTime);
      const intersectionEnd = Math.min(segment.sourceEnd, clipEnd);
      if (intersectionEnd <= intersectionStart) continue;
      const source = offline.createBufferSource();
      source.buffer = buffer;
      const gain = offline.createGain();
      const localStart = intersectionStart - clip.startTime;
      const when = segment.outputStart + intersectionStart - segment.sourceStart;
      const mixDuration = intersectionEnd - intersectionStart;
      const points = Math.max(2, Math.ceil(mixDuration * 50) + 1);
      const curve = Float32Array.from({ length: points }, (_, index) => audioMixGainAt(project, clip, intersectionStart + mixDuration * index / (points - 1), headroom));
      gain.gain.setValueCurveAtTime(curve, when, mixDuration);
      source.connect(gain).connect(offline.destination);
      source.start(when, clip.sourceIn + localStart, mixDuration);
    }
  }
  return offline.startRendering();
}

async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer | null> {
  const context = new AudioContext({ sampleRate: 48_000 });
  try {
    try { return await context.decodeAudioData(await blob.arrayBuffer()); }
    catch { /* Fall back to MediaBunny's container-aware decoder. */ }
  } finally {
    await context.close();
  }
  const { ALL_FORMATS, AudioBufferSink, BlobSource, Input } = await import("mediabunny");
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  const track = await input.getPrimaryAudioTrack();
  if (!track || !(await track.canDecode())) return null;
  const decoded: Array<{ buffer: AudioBuffer; timestamp: number; duration: number }> = [];
  for await (const value of new AudioBufferSink(track).buffers()) decoded.push(value);
  if (!decoded.length) return null;
  const sampleRate = decoded[0].buffer.sampleRate;
  const firstTimestamp = decoded[0].timestamp;
  const end = Math.max(...decoded.map((value) => value.timestamp + value.duration));
  const channels = Math.max(...decoded.map((value) => value.buffer.numberOfChannels));
  const combined = new AudioBuffer({ numberOfChannels: channels, length: Math.max(1, Math.ceil((end - firstTimestamp) * sampleRate)), sampleRate });
  for (const value of decoded) {
    if (value.buffer.sampleRate !== sampleRate) throw new Error("Audio sample rate changed inside one source.");
    const offset = Math.max(0, Math.round((value.timestamp - firstTimestamp) * sampleRate));
    for (let channel = 0; channel < channels; channel += 1) {
      combined.copyToChannel(value.buffer.getChannelData(Math.min(channel, value.buffer.numberOfChannels - 1)), channel, offset);
    }
  }
  return combined;
}
