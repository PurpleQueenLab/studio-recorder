"use client";

import { useCallback, useEffect, useRef } from "react";
import { audioMixGainAt, audioMixHeadroom, audioMixItems, trackIsAudible } from "@/lib/media/audio-mixer";
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
    const headroom = audioMixHeadroom(currentProject);
    const bySource = new Map<string, AudioClip[]>();
    for (const { key, clip } of audioMixItems(currentProject)) bySource.set(key, [...(bySource.get(key) ?? []), clip]);
    for (const [key, clips] of bySource) {
      const active = clips.find((clip) => {
        const localTime = time - clip.startTime;
        return !clip.muted && trackIsAudible(currentProject, clip.trackType) && localTime >= 0 && localTime < clip.sourceOut - clip.sourceIn;
      });
      if (active) syncElement(elements.current.get(key), active, currentProject, time, playing, headroom);
      else elements.current.get(key)?.pause();
    }
  }, []);

  const pause = useCallback(() => elements.current.forEach((audio) => audio.pause()), []);
  return { sync, pause };
}

function syncElement(audio: HTMLAudioElement | undefined, clip: AudioClip, project: StudioProject, time: number, playing: boolean, headroom: number) {
  if (!audio) return;
  const localTime = time - clip.startTime;
  const duration = clip.sourceOut - clip.sourceIn;
  const audible = !clip.muted && trackIsAudible(project, clip.trackType) && localTime >= 0 && localTime < duration;
  if (!audible) { audio.pause(); return; }
  const expected = clip.sourceIn + localTime;
  if (Math.abs(audio.currentTime - expected) > .12) audio.currentTime = Math.max(0, expected);
  audio.volume = Math.min(1, audioMixGainAt(project, clip, time, headroom));
  if (playing && audio.paused) void audio.play().catch(() => undefined);
  else if (!playing) audio.pause();
}

export function audioTrackLabel(type: AudioTrackType): string {
  return type === "microphone" ? "Original narration" : type === "computer-audio" ? "Computer audio" : type === "voiceover" ? "Voiceover" : "Music";
}
