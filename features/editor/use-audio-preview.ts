"use client";

import { useCallback, useEffect, useRef } from "react";
import { clipGainAt, duckingMultiplier, trackFadeAt, trackIsAudible } from "@/lib/media/audio-mixer";
import type { AudioClip, AudioTrackType, StudioProject } from "@/types/project";

export function useAudioPreview(project: StudioProject, urls: Record<string, string>) {
  const elements = useRef(new Map<string, HTMLAudioElement>());
  const projectRef = useRef(project);

  useEffect(() => { projectRef.current = project; }, [project]);

  useEffect(() => {
    const current = elements.current;
    for (const [id, url] of Object.entries(urls)) {
      const existing = current.get(id);
      if (existing?.src === url) continue;
      existing?.pause();
      const audio = new Audio(url);
      audio.preload = "auto";
      current.set(id, audio);
    }
    for (const [id, audio] of current) {
      if (urls[id]) continue;
      audio.pause();
      current.delete(id);
    }
    return () => { current.forEach((audio) => audio.pause()); };
  }, [urls]);

  const sync = useCallback((time: number, playing: boolean) => {
    const currentProject = projectRef.current;
    const original = (["microphone", "computer-audio"] as const).map((type) => ({
      key: type,
      clip: { id: type, sourceId: type, trackType: type, startTime: 0, sourceIn: 0, sourceOut: currentProject.duration, volume: 1, muted: false, fadeIn: 0, fadeOut: 0 } satisfies AudioClip,
    }));
    const clips = currentProject.audio.clips.map((clip) => ({ key: clip.sourceId, clip }));
    for (const { key, clip } of [...original, ...clips]) syncElement(elements.current.get(key), clip, currentProject, time, playing);
  }, []);

  const pause = useCallback(() => elements.current.forEach((audio) => audio.pause()), []);
  return { sync, pause };
}

function syncElement(audio: HTMLAudioElement | undefined, clip: AudioClip, project: StudioProject, time: number, playing: boolean) {
  if (!audio) return;
  const localTime = time - clip.startTime;
  const duration = clip.sourceOut - clip.sourceIn;
  const audible = !clip.muted && trackIsAudible(project, clip.trackType) && localTime >= 0 && localTime < duration;
  if (!audible) { audio.pause(); return; }
  const expected = clip.sourceIn + localTime;
  if (Math.abs(audio.currentTime - expected) > .12) audio.currentTime = Math.max(0, expected);
  const track = project.audio.tracks[clip.trackType];
  audio.volume = Math.min(1, Math.max(0, track.volume * clipGainAt(clip, localTime) * trackFadeAt(project, clip.trackType, time) * duckingMultiplier(project, clip.trackType, time)));
  if (playing && audio.paused) void audio.play().catch(() => undefined);
  else if (!playing) audio.pause();
}

export function audioTrackLabel(type: AudioTrackType): string {
  return type === "microphone" ? "Original narration" : type === "computer-audio" ? "Computer audio" : type === "voiceover" ? "Voiceover" : "Music";
}
