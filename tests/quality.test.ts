import { describe, expect, it } from "vitest";
import { captureVideoBitrate, DEFAULT_CAPTURE_QUALITY, exportVideoBitrate, resolveActualQuality, supportFromTrack, videoConstraints } from "@/lib/media/quality";

function track(settings: MediaTrackSettings, capabilities: MediaTrackCapabilities = {}) {
  return { getSettings: () => settings, getCapabilities: () => capabilities } as unknown as MediaStreamTrack;
}

describe("capability-aware recording quality", () => {
  it("defaults to 1080p 30 FPS High", () => {
    expect(DEFAULT_CAPTURE_QUALITY).toMatchObject({ resolution: "1080p", frameRate: 30, level: "high" });
  });

  it("only exposes resolutions and frame rates supported by the active track", () => {
    const support = supportFromTrack(track({ width: 3840, height: 2160, frameRate: 60 }, { width: { min: 320, max: 3840 }, height: { min: 240, max: 2160 }, frameRate: { min: 1, max: 60 } }));
    expect(support.resolutions).toEqual(["1080p", "1440p", "2160p"]);
    expect(support.frameRates).toEqual([30, 60]);
    expect(support.verified).toBe(true);
  });

  it("requests bounded practical constraints and downgrades actual settings without pretending to upscale", () => {
    expect(videoConstraints({ ...DEFAULT_CAPTURE_QUALITY, frameRate: 60 })).toMatchObject({ width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { ideal: 60, max: 60 } });
    expect(resolveActualQuality({ ...DEFAULT_CAPTURE_QUALITY, resolution: "2160p", width: 3840, height: 2160, frameRate: 60 }, track({ width: 1920, height: 1080, frameRate: 30 }))).toMatchObject({ resolution: "1080p", frameRate: 30, width: 1920, height: 1080 });
  });

  it("uses increasing sane H.264 bitrate targets", () => {
    expect(captureVideoBitrate(DEFAULT_CAPTURE_QUALITY)).toBe(10_000_000);
    expect(exportVideoBitrate("2160p", 60, "maximum")).toBe(90_000_000);
  });
});
