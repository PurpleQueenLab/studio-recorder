import { LocalProjectStore } from "@/lib/storage/project-store";
import type { AudioClip, AudioTrackType, StudioProject } from "@/types/project";

export interface TimelineSegment {
  sourceStart: number;
  sourceEnd: number;
  outputStart: number;
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

  const items: Array<{ clip: AudioClip; blob: Blob }> = [];
  for (const type of ["microphone", "computer-audio"] as const) {
    if (!trackIsAudible(project, type)) continue;
    const descriptor = project.sources.find((source) => source.kind === type);
    if (!descriptor) continue;
    const chunks = await store.getChunks(project.id, type);
    if (!chunks.length) continue;
    items.push({
      clip: { id: type, sourceId: type, trackType: type, startTime: 0, sourceIn: 0, sourceOut: project.duration, volume: 1, muted: false, fadeIn: 0, fadeOut: 0 },
      blob: new Blob(chunks, { type: descriptor.mimeType }),
    });
  }
  for (const clip of project.audio.clips) {
    if (clip.muted || !trackIsAudible(project, clip.trackType)) continue;
    const asset = project.assets.find((item) => item.id === clip.sourceId);
    if (!asset) continue;
    const chunks = await store.getChunks(project.id, clip.sourceId);
    if (chunks.length) items.push({ clip, blob: new Blob(chunks, { type: asset.mimeType }) });
  }
  if (!items.length) return null;

  const decodeContext = new AudioContext({ sampleRate: 48_000 });
  let decoded: Array<{ clip: AudioClip; buffer: AudioBuffer }>;
  try {
    decoded = await Promise.all(items.map(async ({ clip, blob }) => ({ clip, buffer: await decodeContext.decodeAudioData(await blob.arrayBuffer()) })));
  } finally {
    await decodeContext.close();
  }

  const offline = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * 48_000)), 48_000);
  const activeTrackCount = new Set(decoded.map((item) => item.clip.trackType)).size;
  const headroom = .82 / Math.sqrt(Math.max(1, activeTrackCount));
  for (const { clip, buffer } of decoded) {
    const track = project.audio.tracks[clip.trackType];
    const clipEnd = clip.startTime + clip.sourceOut - clip.sourceIn;
    for (const segment of segments) {
      const intersectionStart = Math.max(segment.sourceStart, clip.startTime);
      const intersectionEnd = Math.min(segment.sourceEnd, clipEnd);
      if (intersectionEnd <= intersectionStart) continue;
      const source = offline.createBufferSource();
      source.buffer = buffer;
      const gain = offline.createGain();
      const localStart = intersectionStart - clip.startTime;
      const localEnd = intersectionEnd - clip.startTime;
      const when = segment.outputStart + intersectionStart - segment.sourceStart;
      const base = track.volume * headroom;
      const gainAt = (localTime: number, timelineTime: number) => base * clipGainAt(clip, localTime) * trackFadeAt(project, clip.trackType, timelineTime) * duckingMultiplier(project, clip.trackType, timelineTime);
      gain.gain.setValueAtTime(gainAt(localStart, intersectionStart), when);
      gain.gain.linearRampToValueAtTime(gainAt(localEnd, intersectionEnd), when + intersectionEnd - intersectionStart);
      source.connect(gain).connect(offline.destination);
      source.start(when, clip.sourceIn + localStart, intersectionEnd - intersectionStart);
    }
  }
  return offline.startRendering();
}
