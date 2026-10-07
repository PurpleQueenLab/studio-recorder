import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { zoomTransformAt } from "@/lib/editor/composition";
import { adjustAudioClip, adjustZoomEvent, clampTimelineTime, timelineTimeFromPosition } from "@/lib/editor/timeline";
import { clipGainAt, duckingMultiplier, outputDuration, trackFadeAt, trackIsAudible, visibleTimelineSegments } from "@/lib/media/audio-mixer";
import { createProject, deriveZoomEvents, normalizeProject } from "@/lib/project";
import type { AudioClip } from "@/types/project";

const projectAt = (duration = 10) => {
  const project = createProject("screen", new Date("2026-10-07T10:00:00Z"));
  project.duration = duration;
  return project;
};

describe("timeline interaction model", () => {
  it("maps clicks and drags to bounded timeline times", () => {
    expect(timelineTimeFromPosition(150, 100, 200, 20)).toBe(5);
    expect(timelineTimeFromPosition(20, 100, 200, 20)).toBe(0);
    expect(timelineTimeFromPosition(500, 100, 200, 20)).toBe(20);
    expect(clampTimelineTime(22, 12)).toBe(12);
  });

  it("moves and trims clips without leaving the project", () => {
    const clip: AudioClip = { id: "voice", sourceId: "asset", trackType: "voiceover", startTime: 2, sourceIn: 1, sourceOut: 5, volume: 1, muted: false, fadeIn: 0, fadeOut: 0 };
    expect(adjustAudioClip(clip, "move", 20, 10).startTime).toBe(6);
    expect(adjustAudioClip(clip, "start", 1, 10)).toMatchObject({ startTime: 3, sourceIn: 2, sourceOut: 5 });
    expect(adjustAudioClip(clip, "end", -10, 10).sourceOut).toBeCloseTo(1.1);
  });

  it("moves and resizes zoom events with a minimum duration", () => {
    const zoom = { id: "z", time: 2, duration: 2, x: .5, y: .5, scale: 1.5 };
    expect(adjustZoomEvent(zoom, "move", 20, 10).time).toBe(8);
    expect(adjustZoomEvent(zoom, "start", 1, 10)).toMatchObject({ time: 3, duration: 1 });
    expect(adjustZoomEvent(zoom, "end", -20, 10).duration).toBe(.1);
  });
});

describe("zoom and cursor metadata model", () => {
  it("derives automatic zooms only from bounded observed clicks and suppresses bursts", () => {
    const result = deriveZoomEvents([
      { id: "a", time: 1, x: -2, y: .2, clickType: "primary", scope: "studio-ui" },
      { id: "b", time: 1.2, x: .8, y: 3, clickType: "primary", scope: "studio-ui" },
    ]);
    expect(result).toEqual([{ id: "b", time: 1, x: .8, y: 1, scale: 1.5, duration: 1.45, enabled: true, source: "automatic" }]);
  });

  it("uses a shared eased transform and ignores disabled zooms", () => {
    const project = projectAt();
    project.zoomEvents = [{ id: "z", time: 2, x: .25, y: .75, scale: 2, duration: 2, enabled: true, source: "manual" }];
    expect(zoomTransformAt(project, 1)?.scale).toBeUndefined();
    expect(zoomTransformAt(project, 2.6)).toMatchObject({ scale: 2, x: .25, y: .75 });
    project.zoomEvents[0].enabled = false;
    expect(zoomTransformAt(project, 2.6)).toBeNull();
  });
});

describe("non-destructive audio model", () => {
  it("respects mute, solo, clip fades, and track fades", () => {
    const project = projectAt();
    const clip: AudioClip = { id: "c", sourceId: "a", trackType: "music", startTime: 0, sourceIn: 0, sourceOut: 10, volume: .8, muted: false, fadeIn: 2, fadeOut: 2 };
    expect(clipGainAt(clip, 1)).toBeCloseTo(.4);
    project.audio.tracks.music.fadeIn = 4;
    expect(trackFadeAt(project, "music", 1)).toBe(.25);
    project.audio.tracks.voiceover.solo = true;
    expect(trackIsAudible(project, "music")).toBe(false);
    expect(trackIsAudible(project, "voiceover")).toBe(true);
  });

  it("ducks music only while audible narration is present", () => {
    const project = projectAt();
    project.audio.ducking = { enabled: true, amount: "strong" };
    project.audio.clips = [{ id: "v", sourceId: "voice", trackType: "voiceover", startTime: 3, sourceIn: 0, sourceOut: 2, volume: 1, muted: false, fadeIn: 0, fadeOut: 0 }];
    expect(duckingMultiplier(project, "music", 1)).toBe(1);
    expect(duckingMultiplier(project, "music", 4)).toBe(.28);
  });

  it("applies trim and merged delete ranges to one authoritative output duration", () => {
    const project = projectAt(12);
    project.trim = { start: 1, end: 11 };
    project.edits = [{ type: "delete", start: 2, end: 4 }, { type: "delete", start: 3, end: 5 }, { type: "delete", start: 8, end: 9 }];
    expect(visibleTimelineSegments(project)).toEqual([
      { sourceStart: 1, sourceEnd: 2, outputStart: 0 },
      { sourceStart: 5, sourceEnd: 8, outputStart: 1 },
      { sourceStart: 9, sourceEnd: 11, outputStart: 4 },
    ]);
    expect(outputDuration(project)).toBe(6);
  });

  it("migrates legacy projects with independent tracks and local asset collections", () => {
    const project = projectAt();
    const legacy = { ...project, audio: undefined, assets: undefined, background: undefined, presentation: undefined, pointerEvents: undefined } as unknown as typeof project;
    const migrated = normalizeProject(legacy);
    expect(Object.keys(migrated.audio.tracks)).toEqual(["microphone", "computer-audio", "voiceover", "music"]);
    expect(migrated.assets).toEqual([]);
    expect(migrated.background.type).toBe("color");
    expect(migrated.presentation.frame).toBe("floating");
  });
});

describe("MP4 metadata regression", () => {
  it("sets metadata on Output instead of Conversion options", () => {
    const source = readFileSync(new URL("../features/export/mp4-export-engine.ts", import.meta.url), "utf8");
    expect(source).toContain("output.setMetadataTags");
    expect(source).not.toMatch(/new Conversion\s*\(\s*\{[^}]*\btags\s*:/s);
  });
});
