import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { previewPointFromSource, sourcePointFromPreview, zoomSourceRect, zoomTransformAt } from "@/lib/editor/composition";
import { cameraPixelRect, coverSourceRect } from "@/lib/editor/camera-geometry";
import { adjustAudioClip, adjustZoomEvent, clampTimelineTime, timelineTimeFromPosition } from "@/lib/editor/timeline";
import { clipGainAt, duckingMultiplier, outputDuration, trackFadeAt, trackIsAudible, visibleTimelineSegments } from "@/lib/media/audio-mixer";
import { createProject, deleteVideoRange, deriveZoomEvents, normalizeProject, reorderVideoClip, splitVideoClip, trimVideoClip, videoClipAtTime, videoTimelineDuration } from "@/lib/project";
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
      { id: "a", time: 1, clientX: -20, clientY: 20, observedWidth: 100, observedHeight: 100, x: -2, y: .2, clickType: "primary", scope: "studio-ui" },
      { id: "b", time: 1.2, clientX: 80, clientY: 300, observedWidth: 100, observedHeight: 100, x: .8, y: 3, clickType: "primary", scope: "studio-ui" },
    ]);
    expect(result).toEqual([
      { id: "a", time: .85, x: 0, y: .2, scale: 1.5, duration: 1.4, enabled: true, source: "automatic" },
      { id: "b", time: 1.05, x: .8, y: 1, scale: 1.5, duration: 1.4, enabled: true, source: "automatic" },
    ]);
  });

  it("uses a shared eased transform and ignores disabled zooms", () => {
    const project = projectAt();
    project.zoomEvents = [{ id: "z", time: 2, x: .25, y: .75, scale: 2, duration: 2, enabled: true, source: "manual" }];
    expect(zoomTransformAt(project, 1)?.scale).toBeUndefined();
    expect(zoomTransformAt(project, 2.6)).toMatchObject({ scale: 2, x: .25, y: .75 });
    project.zoomEvents[0].enabled = false;
    expect(zoomTransformAt(project, 2.6)).toBeNull();
  });

  it("uses one edge-aware source rectangle for preview and export focal mapping", () => {
    const project = projectAt();
    project.zoomEvents = [{ id: "edge", time: 2, x: .98, y: .05, scale: 2, duration: 1.4, enabled: true, source: "manual" }];
    const rect = zoomSourceRect(project, 2.7);
    expect(rect).toEqual({ x: .5, y: 0, width: .5, height: .5 });
    const source = sourcePointFromPreview(project, 2.7, .6, .4);
    expect(source).toEqual({ x: .8, y: .2 });
    expect(previewPointFromSource(project, 2.7, source.x, source.y)).toEqual({ x: .6000000000000001, y: .4 });
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

describe("multi-video edit model", () => {
  const clips = [
    { id: "a", sourceId: "one", name: "One", timelineStart: 0, sourceIn: 1, sourceOut: 5 },
    { id: "b", sourceId: "two", name: "Two", timelineStart: 4, sourceIn: 0, sourceOut: 3 },
  ];

  it("splits the selected clip without changing output duration", () => {
    const result = splitVideoClip(clips, "a", 2, "split");
    expect(result.map((clip) => [clip.id, clip.timelineStart, clip.sourceIn, clip.sourceOut])).toEqual([
      ["a", 0, 1, 3], ["split", 2, 3, 5], ["b", 4, 0, 3],
    ]);
    expect(videoTimelineDuration(result)).toBe(7);
  });

  it("trims, reorders, and maps timeline time to source time", () => {
    const trimmed = trimVideoClip(clips, "a", "start", 1);
    expect(trimmed[0]).toMatchObject({ sourceIn: 2, timelineStart: 0 });
    expect(trimmed[1].timelineStart).toBe(3);
    const reordered = reorderVideoClip(trimmed, "b", 0);
    expect(reordered.map((clip) => clip.id)).toEqual(["b", "a"]);
    expect(videoClipAtTime(reordered, 3.5)).toMatchObject({ clip: { id: "a" }, sourceTime: 2.5 });
  });

  it("deletes a range across clips while preserving source media", () => {
    const result = deleteVideoRange(clips, 2, 5);
    expect(videoTimelineDuration(result)).toBe(4);
    expect(result.map((clip) => [clip.sourceId, clip.sourceIn, clip.sourceOut])).toEqual([["one", 1, 3], ["two", 1, 3]]);
  });

  it("adds a legacy video clip during additive migration", () => {
    const project = projectAt(8);
    project.sources = [{ kind: "screen", chunkCount: 1, mimeType: "video/webm" }];
    project.videoClips = [];
    expect(normalizeProject(project).videoClips[0]).toMatchObject({ sourceId: "screen", sourceIn: 0, sourceOut: 8 });
  });
});

describe("MP4 metadata regression", () => {
  it("sets metadata on Output instead of Conversion options", () => {
    const source = readFileSync(new URL("../features/export/mp4-export-engine.ts", import.meta.url), "utf8");
    expect(source).toContain("output.setMetadataTags");
    expect(source).not.toMatch(/new Conversion\s*\(\s*\{[^}]*\btags\s*:/s);
  });

  it("keeps crop guides out of playback and uses one primary theme token", () => {
    const editor = readFileSync(new URL("../features/editor/editor-view.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    expect(editor).toContain('tool === "crop" && !playing ? <CropOverlay');
    expect(css).toContain("--bg-selected: var(--primary)");
    expect(css).toContain("--accent: var(--primary)");
  });

  it("prefers generated local thumbnails and keeps theme-specific fallbacks", () => {
    const library = readFileSync(new URL("../features/library/library-view.tsx", import.meta.url), "utf8");
    const theme = readFileSync(new URL("../components/theme-provider.tsx", import.meta.url), "utf8");
    expect(library).toContain('thumbnailUrls[project.id] ?? (theme === "dark" ? "/thumbnail-dark.png" : "/thumbnail-light.png")');
    expect(theme).toContain('theme === "dark" ? "/favicon-dark.png" : "/favicon-light.png"');
  });
});

describe("camera bubble geometry", () => {
  it("uses true 1:1 pixels for circle and square shapes", () => {
    const rect = { x: .75, y: .7, width: .2, height: .2 };
    expect(cameraPixelRect(rect, "circle", 1920, 1080)).toMatchObject({ width: 384, height: 384 });
    expect(cameraPixelRect(rect, "square", 1080, 1920)).toMatchObject({ width: 216, height: 216 });
    expect(cameraPixelRect(rect, "rounded", 1920, 1080)).toMatchObject({ width: 384, height: 216 });
  });

  it("centre-crops camera video instead of stretching faces", () => {
    expect(coverSourceRect(1920, 1080, 300, 300)).toEqual({ x: 420, y: 0, width: 1080, height: 1080 });
  });

  it("keeps the Screen + Camera track in capture, editor preview, and export without browser PiP", () => {
    const capture = readFileSync(new URL("../lib/media/capture-engine.ts", import.meta.url), "utf8");
    const recordingPanel = readFileSync(new URL("../features/recording/recording-panel.tsx", import.meta.url), "utf8");
    const editor = readFileSync(new URL("../features/editor/editor-view.tsx", import.meta.url), "utf8");
    const exporter = readFileSync(new URL("../features/export/mp4-export-engine.ts", import.meta.url), "utf8");
    expect(capture).toContain('["camera", this.camera]');
    expect(editor).toContain("mediaUrls.camera && project.camera.visible");
    expect(exporter).toContain('project.mode === "screen-camera" ? await sourceBlob(store, project, "camera")');
    expect(recordingPanel).not.toMatch(/pictureInPicture|camera-monitor|Keep camera visible while recording/);
  });

  it("keeps shared CTA padding and icon spacing comfortable", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.primary \{[^}]*gap:7px[^}]*padding:10px 16px/);
    expect(css).toMatch(/\.secondary,\.stop-button\{[^}]*gap:7px[^}]*padding:0 16px/);
  });
});
