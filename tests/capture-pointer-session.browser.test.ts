import { describe, expect, it } from "vitest";
import { isStudioTabCapture, PointerCaptureSession, STUDIO_CAPTURE_HANDLE } from "@/lib/media/pointer-capture";
import { deriveZoomEvents } from "@/lib/project";
import type { PointerEventMetadata } from "@/types/project";

class FakePointerTarget {
  private listener?: (event: PointerEvent) => void;

  addEventListener(_type: "pointerdown", listener: (event: PointerEvent) => void) { this.listener = listener; }
  removeEventListener(_type: "pointerdown", listener: (event: PointerEvent) => void) { if (this.listener === listener) this.listener = undefined; }
  emit(clientX: number, clientY: number, button = 0) { this.listener?.({ clientX, clientY, button } as PointerEvent); }
}

describe("same-page pointer capture session", () => {
  it("identifies same-origin Studio Recorder capture without relying on Chrome's track label", () => {
    const track = {
      label: "This Tab",
      getCaptureHandle: () => ({ handle: STUDIO_CAPTURE_HANDLE, origin: "http://localhost:3000" }),
    } as unknown as MediaStreamTrack;
    expect(isStudioTabCapture(track, "http://localhost:3000", "Record — Studio Recorder")).toBe(true);
    expect(isStudioTabCapture(track, "https://another.example", "Record — Studio Recorder")).toBe(false);
  });

  it("stores normalized active-timeline clicks, excludes pause, resumes, and generates focal zooms", () => {
    const target = new FakePointerTarget();
    const captured: PointerEventMetadata[] = [];
    let now = 1_000;
    let id = 0;
    const session = new PointerCaptureSession({
      target,
      now: () => now,
      viewport: () => ({ width: 1_000, height: 500 }),
      createId: () => `click-${++id}`,
      onCapture: (event) => captured.push(event),
    });

    session.start();
    now = 1_500;
    target.emit(710, 190);
    session.pause();
    now = 2_500;
    target.emit(100, 100);
    session.resume();
    now = 3_000;
    target.emit(980, 25, 2);
    now = 3_100;
    expect(session.stop()).toBeCloseTo(1.1);
    target.emit(500, 250);

    expect(captured).toHaveLength(2);
    expect(captured[0]).toMatchObject({ time: .5, clientX: 710, clientY: 190, observedWidth: 1_000, observedHeight: 500, x: .71, y: .38, clickType: "primary" });
    expect(captured[1]).toMatchObject({ time: 1, x: .98, y: .05, clickType: "secondary" });

    const zooms = deriveZoomEvents(captured);
    expect(zooms).toHaveLength(2);
    expect(zooms[0]).toMatchObject({ time: .35, x: .71, y: .38, source: "automatic" });
    expect(zooms[1]).toMatchObject({ time: .85, x: .98, y: .05, source: "automatic" });
  });
});
