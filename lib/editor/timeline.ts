export function timelineTimeFromPosition(clientX: number, left: number, width: number, duration: number): number {
  if (width <= 0 || duration <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (clientX - left) / width));
  return ratio * duration;
}

export function clampTimelineTime(time: number, duration: number): number {
  return Math.min(Math.max(0, duration), Math.max(0, time));
}

export function adjustAudioClip(clip: AudioClip, mode: "move" | "start" | "end", delta: number, projectDuration: number): AudioClip {
  const duration = clip.sourceOut - clip.sourceIn;
  if (mode === "move") return { ...clip, startTime: Math.max(0, Math.min(projectDuration - duration, clip.startTime + delta)) };
  if (mode === "start") {
    const adjustment = Math.max(-clip.sourceIn, Math.min(duration - .1, delta));
    return { ...clip, startTime: Math.max(0, clip.startTime + adjustment), sourceIn: clip.sourceIn + adjustment };
  }
  return { ...clip, sourceOut: Math.max(clip.sourceIn + .1, Math.min(clip.sourceOut + delta, clip.sourceOut + Math.max(0, projectDuration - clip.startTime - duration))) };
}

export function deleteAudioRange(clips: AudioClip[], start: number, end: number): AudioClip[] {
  if (end - start < .05) return clips;
  const removed = end - start;
  return clips.flatMap((clip) => {
    const clipStart = clip.startTime;
    const clipEnd = clipStart + clip.sourceOut - clip.sourceIn;
    if (clipEnd <= start) return [clip];
    if (clipStart >= end) return [{ ...clip, startTime: Math.max(0, clip.startTime - removed) }];
    const before = Math.max(0, start - clipStart);
    const after = Math.max(0, clipEnd - end);
    const result: AudioClip[] = [];
    if (before >= .05) result.push({ ...clip, sourceOut: clip.sourceIn + before });
    if (after >= .05) result.push({ ...clip, id: crypto.randomUUID(), startTime: start, sourceIn: clip.sourceOut - after });
    return result;
  });
}

export function adjustZoomEvent(event: ZoomEvent, mode: "move" | "start" | "end", delta: number, projectDuration: number): ZoomEvent {
  if (mode === "move") return { ...event, time: Math.max(0, Math.min(projectDuration - event.duration, event.time + delta)) };
  if (mode === "start") {
    const adjustment = Math.max(-event.time, Math.min(event.duration - .1, delta));
    return { ...event, time: event.time + adjustment, duration: event.duration - adjustment };
  }
  return { ...event, duration: Math.max(.1, Math.min(event.duration + delta, projectDuration - event.time)) };
}
import type { AudioClip, ZoomEvent } from "@/types/project";
