import { afterEach, describe, expect, it, vi } from "vitest";
import { closeCameraMonitor, openCameraMonitor } from "@/lib/media/camera-monitor";

afterEach(() => vi.unstubAllGlobals());

describe("floating camera monitor", () => {
  it("falls back without blocking recording when PiP is unsupported", async () => {
    vi.stubGlobal("document", { pictureInPictureEnabled: false });
    const result = await openCameraMonitor({} as HTMLVideoElement);
    expect(result.active).toBe(false);
    expect(result.message).toContain("Recording will continue");
  });

  it("opens and closes Picture-in-Picture when supported", async () => {
    const video = { paused: false, requestPictureInPicture: vi.fn().mockResolvedValue({}) } as unknown as HTMLVideoElement;
    const exit = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("document", { pictureInPictureEnabled: true, pictureInPictureElement: video, exitPictureInPicture: exit });
    expect(await openCameraMonitor(video)).toEqual({ active: true });
    await closeCameraMonitor();
    expect(exit).toHaveBeenCalledOnce();
  });
});
