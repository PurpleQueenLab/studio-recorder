import { describe, expect, it } from "vitest";
import { detectCapabilities } from "@/lib/media/capabilities";

describe("detectCapabilities", () => {
  it("reports actual browser features and a supported recording mime", () => {
    class Recorder {
      static isTypeSupported(type: string) { return type.includes("vp8"); }
    }
    const scope = {
      isSecureContext: true,
      navigator: { mediaDevices: { getDisplayMedia() {}, getUserMedia() {} } },
      MediaRecorder: Recorder,
      VideoEncoder: class {}, AudioEncoder: class {}, OffscreenCanvas: class {},
      showSaveFilePicker() {}, indexedDB: {},
    } as unknown as Window;
    expect(detectCapabilities(scope)).toMatchObject({
      secureContext: true,
      displayCapture: true,
      webCodecs: true,
      fileSystemAccess: true,
      compatibleRecorderMimeType: "video/webm;codecs=vp8,opus",
    });
  });

  it("never fakes unavailable APIs", () => {
    const scope = { isSecureContext: false, navigator: {} } as Window;
    expect(detectCapabilities(scope)).toMatchObject({ displayCapture: false, camera: false, mediaRecorder: false, webCodecs: false });
  });
});
